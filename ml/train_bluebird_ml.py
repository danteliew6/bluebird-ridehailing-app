# Databricks notebook source
# MAGIC %md
# MAGIC # Bluebird ML — Predictive Maintenance + Demand Forecast
# MAGIC AutoML-style Optuna hyperparameter search for a 7-day "will need service" classifier,
# MAGIC registered to Unity Catalog, plus a demand forecast written to a gold table.

# COMMAND ----------
import os, sys, json, mlflow, optuna
import numpy as np
from pyspark.sql import functions as F, Window
from mlflow.tracking import MlflowClient
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, average_precision_score

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
from bluebird_config import CATALOG, SCHEMA, S, EXPERIMENT_DIR, get_spark  # noqa: E402

spark = get_spark()


def _emit(payload):
    """Return the run summary — via dbutils in a notebook, else just print it."""
    try:
        dbutils.notebook.exit(payload)  # noqa: F821 — provided in notebook runtime
    except NameError:
        print("RESULT", payload)
MODEL_NAME = f"{S}.vehicle_maintenance_clf"
mlflow.set_registry_uri("databricks-uc")
mlflow.set_experiment(f"{EXPERIMENT_DIR}/maintenance_experiment")

# COMMAND ----------
# MAGIC %md
# MAGIC ## Build features + forward-looking label (needs service within next 7 days)

# COMMAND ----------
health = spark.table(f"{CATALOG}.{SCHEMA}.fact_vehicle_health")
veh = spark.table(f"{CATALOG}.{SCHEMA}.dim_vehicle").select("vehicle_id", "year")

df = (health.join(veh, "vehicle_id")
      .withColumn("vehicle_age", F.lit(2026) - F.col("year"))
      .withColumn("day_idx", F.datediff(F.col("reading_date"), F.lit("2026-01-01"))))

# label = will the vehicle need service in the NEXT 7 days (early-warning target)
w = Window.partitionBy("vehicle_id").orderBy("day_idx").rangeBetween(1, 7)
df = df.withColumn("future_need", F.max("needs_service_flag").over(w))
# keep only rows that have a full 7-day forward window
maxidx = Window.partitionBy("vehicle_id")
df = (df.withColumn("max_idx", F.max("day_idx").over(maxidx))
        .filter(F.col("day_idx") <= F.col("max_idx") - 7))

FEATURES = ["engine_temp_c", "brake_wear_pct", "battery_v", "km_since_service",
            "dtc_count", "anomaly_score", "vehicle_age"]
pdf = df.select(*FEATURES, F.col("future_need").alias("label")).toPandas()
print("training rows:", len(pdf), "| positive rate:", round(pdf.label.mean(), 3))

X, y = pdf[FEATURES], pdf["label"].astype(int)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, stratify=y, random_state=42)
pos_weight = (y_train == 0).sum() / max(1, (y_train == 1).sum())

# COMMAND ----------
# MAGIC %md
# MAGIC ## AutoML-style hyperparameter search (Optuna, nested MLflow runs)

# COMMAND ----------
mlflow.xgboost.autolog(log_input_examples=True, silent=True)

def objective(trial):
    params = {
        "n_estimators": trial.suggest_int("n_estimators", 120, 400),
        "max_depth": trial.suggest_int("max_depth", 3, 9),
        "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
        "subsample": trial.suggest_float("subsample", 0.6, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
        "scale_pos_weight": pos_weight,
        "eval_metric": "logloss",
    }
    with mlflow.start_run(nested=True):
        m = XGBClassifier(**params).fit(X_train, y_train)
        auc = roc_auc_score(y_test, m.predict_proba(X_test)[:, 1])
        mlflow.log_metric("val_auc", auc)
        return auc

with mlflow.start_run(run_name="hpo") as parent:
    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=15)
    mlflow.log_params({f"best_{k}": v for k, v in study.best_params.items()})
print("best val AUC:", round(study.best_value, 4))

# COMMAND ----------
# MAGIC %md
# MAGIC ## Retrain best params and register to Unity Catalog

# COMMAND ----------
with mlflow.start_run(run_name="best"):
    best = XGBClassifier(**study.best_params, scale_pos_weight=pos_weight, eval_metric="logloss").fit(X, y)
    auc = roc_auc_score(y_test, best.predict_proba(X_test)[:, 1])
    ap = average_precision_score(y_test, best.predict_proba(X_test)[:, 1])
    mlflow.log_metrics({"val_auc": auc, "val_avg_precision": ap})
    info = mlflow.xgboost.log_model(best, name="model", registered_model_name=MODEL_NAME,
                                    input_example=X_train.head(3))
client = MlflowClient(registry_uri="databricks-uc")
client.set_registered_model_alias(MODEL_NAME, "prod", info.registered_model_version)
print("registered version:", info.registered_model_version)

# COMMAND ----------
# MAGIC %md
# MAGIC ## Batch score latest reading per vehicle -> gold_vehicle_predictions

# COMMAND ----------
latest = (health.join(veh, "vehicle_id")
          .withColumn("vehicle_age", F.lit(2026) - F.col("year"))
          .withColumn("rn", F.row_number().over(
              Window.partitionBy("vehicle_id").orderBy(F.col("reading_date").desc())))
          .filter(F.col("rn") == 1))

predict = mlflow.pyfunc.spark_udf(spark, model_uri=f"models:/{MODEL_NAME}@prod", env_manager="local")
scored = (latest.withColumn("service_risk_7d", predict(*[F.col(c) for c in FEATURES]))
          .select("vehicle_id", "fleet_brand", "reading_date", *FEATURES,
                  F.col("needs_service_flag").alias("needs_service_now"),
                  F.round(F.col("service_risk_7d"), 4).alias("service_risk_7d"),
                  F.current_timestamp().alias("scored_at")))
scored.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(f"{CATALOG}.{SCHEMA}.gold_vehicle_predictions")
n_at_risk = scored.filter("service_risk_7d >= 0.5").count()
print("vehicles at risk (>=0.5):", n_at_risk)

# COMMAND ----------
# MAGIC %md
# MAGIC ## Demand forecast -> gold_demand_forecast (ai_forecast, seasonal fallback)

# COMMAND ----------
spark.sql(f"""
  CREATE OR REPLACE TABLE {CATALOG}.{SCHEMA}._demand_hourly AS
  SELECT date_trunc('HOUR', request_ts) AS ts, city, COUNT(*) AS trips
  FROM {CATALOG}.{SCHEMA}.fact_trip GROUP BY 1, 2
""")
forecast_ok = False
try:
    spark.sql(f"""
      CREATE OR REPLACE TABLE {CATALOG}.{SCHEMA}.gold_demand_forecast AS
      SELECT city, ts AS forecast_ts, trips_forecast, trips_upper, trips_lower
      FROM AI_FORECAST(
        TABLE({CATALOG}.{SCHEMA}._demand_hourly),
        horizon => (SELECT dateadd(HOUR, 168, MAX(ts)) FROM {CATALOG}.{SCHEMA}._demand_hourly),
        time_col => 'ts', value_col => 'trips', group_col => 'city')
    """)
    forecast_ok = True
    method = "ai_forecast"
except Exception as e:
    print("ai_forecast unavailable, using seasonal profile:", str(e).splitlines()[0][:120])
    # seasonal fallback: avg trips by city x dow x hour, projected 7 days forward
    prof = spark.sql(f"""
      WITH p AS (
        SELECT city, dayofweek(request_ts) dow, hour(request_ts) hr, COUNT(*)/COUNT(DISTINCT to_date(request_ts)) avg_trips
        FROM {CATALOG}.{SCHEMA}.fact_trip GROUP BY 1,2,3),
      future AS (
        SELECT explode(sequence(date_trunc('HOUR', current_timestamp()),
               date_trunc('HOUR', current_timestamp()) + INTERVAL 167 HOURS, INTERVAL 1 HOUR)) ts)
      SELECT p.city, f.ts AS forecast_ts,
             ROUND(p.avg_trips) AS trips_forecast,
             ROUND(p.avg_trips*1.25) AS trips_upper, ROUND(p.avg_trips*0.75) AS trips_lower
      FROM future f JOIN p ON dayofweek(f.ts)=p.dow AND hour(f.ts)=p.hr
    """)
    prof.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(f"{CATALOG}.{SCHEMA}.gold_demand_forecast")
    method = "seasonal_profile"

fc_rows = spark.table(f"{CATALOG}.{SCHEMA}.gold_demand_forecast").count()
spark.sql(f"DROP TABLE IF EXISTS {CATALOG}.{SCHEMA}._demand_hourly")

# COMMAND ----------
_emit(json.dumps({
    "model_version": info.registered_model_version,
    "val_auc": round(auc, 4),
    "val_avg_precision": round(ap, 4),
    "vehicles_at_risk": int(n_at_risk),
    "forecast_method": method,
    "forecast_rows": int(fc_rows),
}))
