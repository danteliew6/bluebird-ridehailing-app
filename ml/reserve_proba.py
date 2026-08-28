# Databricks notebook source
# MAGIC %md
# MAGIC # Re-serve maintenance model as probability
# MAGIC Wrap the trained XGBoost classifier in a pyfunc that returns the 7-day
# MAGIC service-risk *probability* (0-1), register v2, update the endpoint, and
# MAGIC rescore the gold predictions table with the real score.

# COMMAND ----------
import json, mlflow, pandas as pd
from mlflow.tracking import MlflowClient
from mlflow.pyfunc import PythonModel
from pyspark.sql import functions as F, Window

CATALOG, SCHEMA = "dante_classic_stable_catalog", "bluebird_ride_hailing"
MODEL_NAME = f"{CATALOG}.{SCHEMA}.vehicle_maintenance_clf"
FEATURES = ["engine_temp_c", "brake_wear_pct", "battery_v", "km_since_service",
            "dtc_count", "anomaly_score", "vehicle_age"]
mlflow.set_registry_uri("databricks-uc")
mlflow.set_experiment("/Users/dante.liew@databricks.com/bluebird_ml/maintenance_experiment")

# COMMAND ----------
# Load the trained xgboost model from v1 explicitly (v1 = the original xgboost model;
# do NOT use @prod here — a prior run may have moved @prod to a pyfunc wrapper version).
booster_uri = f"models:/{MODEL_NAME}/1"
base = mlflow.xgboost.load_model(booster_uri)

class ProbaWrapper(PythonModel):
    def load_context(self, context):
        import mlflow.xgboost
        self.model = mlflow.xgboost.load_model(context.artifacts["clf"])
    def predict(self, context, model_input):
        import pandas as pd
        X = pd.DataFrame(model_input)[FEATURES].astype("float64")
        proba = self.model.predict_proba(X)[:, 1]
        return pd.DataFrame({"service_risk_7d": proba})

# log the wrapper with the base model as an artifact. UC requires a signature, so declare
# an ALL-DOUBLE input schema — MLflow safely upcasts incoming ints (JSON / spark) to double,
# and the wrapper also casts to float64 internally, so mixed-type requests still work.
from mlflow.models import ModelSignature
from mlflow.types import Schema, ColSpec
sig = ModelSignature(
    inputs=Schema([ColSpec("double", c) for c in FEATURES]),
    outputs=Schema([ColSpec("double", "service_risk_7d")]),
)
local_clf = "/tmp/bb_clf"
mlflow.xgboost.save_model(base, local_clf)
with mlflow.start_run(run_name="proba_wrapper"):
    info = mlflow.pyfunc.log_model(
        name="model",
        python_model=ProbaWrapper(),
        artifacts={"clf": local_clf},
        signature=sig,
        registered_model_name=MODEL_NAME,
    )
client = MlflowClient(registry_uri="databricks-uc")
client.set_registered_model_alias(MODEL_NAME, "prod", info.registered_model_version)
new_version = info.registered_model_version
print("registered proba version:", new_version)

# COMMAND ----------
# Rescore gold_vehicle_predictions with the real probability
health = spark.table(f"{CATALOG}.{SCHEMA}.fact_vehicle_health")
veh = spark.table(f"{CATALOG}.{SCHEMA}.dim_vehicle").select("vehicle_id", "year")
latest = (health.join(veh, "vehicle_id")
          .withColumn("vehicle_age", F.lit(2026) - F.col("year"))
          .withColumn("rn", F.row_number().over(
              Window.partitionBy("vehicle_id").orderBy(F.col("reading_date").desc())))
          .filter(F.col("rn") == 1))
for c in FEATURES:
    latest = latest.withColumn(c, F.col(c).cast("double"))
predict = mlflow.pyfunc.spark_udf(spark, model_uri=f"models:/{MODEL_NAME}@prod",
                                  env_manager="local", result_type="double")
scored = (latest.withColumn("service_risk_7d", predict(*[F.col(c) for c in FEATURES]))
          .select("vehicle_id", "fleet_brand", "reading_date", *FEATURES,
                  F.col("needs_service_flag").alias("needs_service_now"),
                  F.round(F.col("service_risk_7d"), 4).alias("service_risk_7d"),
                  F.current_timestamp().alias("scored_at")))
scored.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(f"{CATALOG}.{SCHEMA}.gold_vehicle_predictions")
n_high = scored.filter("service_risk_7d >= 0.7").count()
print("high-risk (>=0.7):", n_high)

# COMMAND ----------
# Update the serving endpoint to the new version
from mlflow.deployments import get_deploy_client
dc = get_deploy_client("databricks")
dc.update_endpoint("bluebird-maintenance", config={
    "served_entities": [{
        "entity_name": MODEL_NAME, "entity_version": new_version,
        "workload_size": "Small", "scale_to_zero_enabled": True,
    }]
})
print("endpoint update requested for version", new_version)

# COMMAND ----------
dbutils.notebook.exit(json.dumps({"version": new_version, "high_risk_ge_0_7": int(n_high)}))
