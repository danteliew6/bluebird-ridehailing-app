# Databricks notebook source
# MAGIC %md
# MAGIC # Bluebird Demand Forecast — ML model (XGBoost regressor)
# MAGIC Trains a real ML demand-forecasting model on daily trips per city with calendar +
# MAGIC lag/rolling features, Optuna hyperparameter search, MLflow, registered to Unity Catalog.
# MAGIC Produces a recursive 7-day-ahead forecast written to `gold_demand_forecast`
# MAGIC (same schema the app already reads: city, forecast_ts, trips_forecast, trips_upper, trips_lower).

# COMMAND ----------
import json, mlflow, optuna
import numpy as np
import pandas as pd
from datetime import timedelta
from pyspark.sql import functions as F
from mlflow.tracking import MlflowClient
from xgboost import XGBRegressor
from sklearn.metrics import mean_squared_error, mean_absolute_error

CATALOG, SCHEMA = "dante_classic_stable_catalog", "bluebird_ride_hailing"
MODEL_NAME = f"{CATALOG}.{SCHEMA}.bluebird_demand_forecast"
mlflow.set_registry_uri("databricks-uc")
mlflow.set_experiment("/Users/dante.liew@databricks.com/bluebird_ml/demand_forecast_experiment")

# COMMAND ----------
# MAGIC %md
# MAGIC ## Build daily demand series + features

# COMMAND ----------
daily = (spark.table(f"{CATALOG}.{SCHEMA}.trips_curated_gold")
         .groupBy(F.to_date("request_ts").alias("ds"), "city")
         .agg(F.count(F.lit(1)).alias("trips"))
         .orderBy("city", "ds")).toPandas()
daily["ds"] = pd.to_datetime(daily["ds"])
CITIES = sorted(daily["city"].unique().tolist())
print("cities:", CITIES, "| days:", daily["ds"].nunique(), "| rows:", len(daily))

BASE_FEATURES = ["dow", "day", "month", "woy", "is_weekend", "lag_1", "lag_7", "roll7_mean", "roll7_std"]
CITY_COLS = [f"city_{c}" for c in CITIES]
FEATURES = BASE_FEATURES + CITY_COLS

def add_calendar(df):
    df = df.copy()
    df["dow"] = df["ds"].dt.dayofweek
    df["day"] = df["ds"].dt.day
    df["month"] = df["ds"].dt.month
    df["woy"] = df["ds"].dt.isocalendar().week.astype(int)
    df["is_weekend"] = (df["dow"] >= 5).astype(int)
    return df

# per-city lag / rolling features
parts = []
for c in CITIES:
    g = daily[daily["city"] == c].sort_values("ds").copy()
    g["lag_1"] = g["trips"].shift(1)
    g["lag_7"] = g["trips"].shift(7)
    g["roll7_mean"] = g["trips"].shift(1).rolling(7).mean()
    g["roll7_std"] = g["trips"].shift(1).rolling(7).std()
    parts.append(g)
feat = pd.concat(parts, ignore_index=True)
feat = add_calendar(feat)
for c in CITIES:
    feat[f"city_{c}"] = (feat["city"] == c).astype(int)
feat = feat.dropna(subset=["lag_1", "lag_7", "roll7_mean", "roll7_std"]).reset_index(drop=True)

# time-based split: last 14 days = validation
cutoff = feat["ds"].max() - timedelta(days=14)
train_df = feat[feat["ds"] <= cutoff]
val_df = feat[feat["ds"] > cutoff]
X_train, y_train = train_df[FEATURES], train_df["trips"]
X_val, y_val = val_df[FEATURES], val_df["trips"]
print(f"train rows: {len(X_train)} | val rows: {len(X_val)}")

# COMMAND ----------
# MAGIC %md
# MAGIC ## Optuna hyperparameter search (nested MLflow runs)

# COMMAND ----------
mlflow.xgboost.autolog(log_input_examples=True, silent=True)

def objective(trial):
    params = {
        "n_estimators": trial.suggest_int("n_estimators", 150, 500),
        "max_depth": trial.suggest_int("max_depth", 3, 8),
        "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
        "subsample": trial.suggest_float("subsample", 0.6, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
        "min_child_weight": trial.suggest_int("min_child_weight", 1, 8),
    }
    with mlflow.start_run(nested=True):
        m = XGBRegressor(**params, objective="reg:squarederror").fit(X_train, y_train)
        rmse = float(np.sqrt(mean_squared_error(y_val, m.predict(X_val))))
        mlflow.log_metric("val_rmse", rmse)
        return rmse

with mlflow.start_run(run_name="hpo") as parent:
    study = optuna.create_study(direction="minimize")
    study.optimize(objective, n_trials=20)
    mlflow.log_params({f"best_{k}": v for k, v in study.best_params.items()})
print("best val RMSE:", round(study.best_value, 2))

# COMMAND ----------
# MAGIC %md
# MAGIC ## Retrain best params on full history and register to Unity Catalog

# COMMAND ----------
# Honest out-of-sample eval: train on the train window only, score the held-out validation
# window. (Metrics and residual bands MUST come from a model that never saw the val rows.)
val_model = XGBRegressor(**study.best_params, objective="reg:squarederror").fit(X_train, y_train)
val_pred = val_model.predict(X_val)
rmse = float(np.sqrt(mean_squared_error(y_val, val_pred)))
mae = float(mean_absolute_error(y_val, val_pred))
# naive baseline = last-week same-day (lag_7) for context
naive_rmse = float(np.sqrt(mean_squared_error(y_val, X_val["lag_7"])))

# prediction-interval width from OUT-OF-SAMPLE residuals (per-city, global fallback)
val_resid = val_df.assign(resid=(y_val.values - val_pred))
resid_std = val_resid.groupby("city")["resid"].std().to_dict()
global_std = float(np.nanstd(y_val.values - val_pred)) or 1.0

# Final forecasting model: refit on ALL history so the most recent days inform the forecast.
X_all, y_all = feat[FEATURES], feat["trips"]
with mlflow.start_run(run_name="best"):
    best = XGBRegressor(**study.best_params, objective="reg:squarederror").fit(X_all, y_all)
    mlflow.log_metrics({"val_rmse": rmse, "val_mae": mae, "naive_lag7_rmse": naive_rmse})
    info = mlflow.xgboost.log_model(best, name="model", registered_model_name=MODEL_NAME,
                                    input_example=X_train.head(3))
client = MlflowClient(registry_uri="databricks-uc")
client.set_registered_model_alias(MODEL_NAME, "prod", info.registered_model_version)
print(f"registered v{info.registered_model_version} | val RMSE {rmse:.1f} vs naive {naive_rmse:.1f} | MAE {mae:.1f}")

# COMMAND ----------
# MAGIC %md
# MAGIC ## Recursive 7-day-ahead forecast -> gold_demand_forecast

# COMMAND ----------
Z = 1.28  # ~80% prediction interval
horizon = 7
out_rows = []
for c in CITIES:
    hist = daily[daily["city"] == c].sort_values("ds")
    series = hist["trips"].tolist()
    dates = hist["ds"].tolist()
    last = dates[-1]
    std_c = float(resid_std.get(c, global_std)) if not np.isnan(resid_std.get(c, np.nan)) else global_std
    for step in range(1, horizon + 1):
        d = last + timedelta(days=step)
        row = {
            "dow": d.dayofweek, "day": d.day, "month": d.month,
            "woy": int(pd.Timestamp(d).isocalendar().week), "is_weekend": int(d.dayofweek >= 5),
            "lag_1": series[-1], "lag_7": series[-7] if len(series) >= 7 else series[0],
            "roll7_mean": float(np.mean(series[-7:])), "roll7_std": float(np.std(series[-7:])),
        }
        for cc in CITIES:
            row[f"city_{cc}"] = 1 if cc == c else 0
        pred = float(best.predict(pd.DataFrame([row])[FEATURES])[0])
        pred = max(0.0, pred)
        out_rows.append({
            "city": c, "forecast_ts": pd.Timestamp(d),
            "trips_forecast": round(pred, 1),
            "trips_upper": round(pred + Z * std_c, 1),
            "trips_lower": round(max(0.0, pred - Z * std_c), 1),
        })
        series.append(pred)  # feed prediction forward

fc = pd.DataFrame(out_rows)
sdf = (spark.createDataFrame(fc)
       .withColumn("forecast_ts", F.col("forecast_ts").cast("timestamp"))
       .withColumn("trips_forecast", F.col("trips_forecast").cast("double"))
       .withColumn("trips_upper", F.col("trips_upper").cast("double"))
       .withColumn("trips_lower", F.col("trips_lower").cast("double"))
       .select("city", "forecast_ts", "trips_forecast", "trips_upper", "trips_lower"))
sdf.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(f"{CATALOG}.{SCHEMA}.gold_demand_forecast")
fc_rows = sdf.count()
print("forecast rows written:", fc_rows)
spark.sql(f"COMMENT ON TABLE {CATALOG}.{SCHEMA}.gold_demand_forecast IS "
          f"'7-day demand forecast from the bluebird_demand_forecast XGBoost model (calendar + lag/rolling features).'")

# COMMAND ----------
dbutils.notebook.exit(json.dumps({
    "model_version": info.registered_model_version,
    "val_rmse": round(rmse, 2),
    "val_mae": round(mae, 2),
    "naive_lag7_rmse": round(naive_rmse, 2),
    "forecast_rows": int(fc_rows),
}))
