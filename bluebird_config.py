"""Central, env-driven configuration for the Bluebird ride-hailing solution.

Every data / governance / ML / jobs script imports catalog, schema, warehouse and
Spark bootstrap from here so the whole solution can be re-pointed at a different
workspace by setting a handful of environment variables — the DABs bootstrap job
sets them from bundle variables (BLUEBIRD_CATALOG=${var.catalog}, etc.).

Defaults reproduce the original `fevm-dante-classic-stable` build, so running any
script with no environment set behaves exactly as before (backward compatible).

Environment variables
----------------------
  BLUEBIRD_CATALOG            UC catalog          (default: dante_classic_stable_catalog)
  BLUEBIRD_SCHEMA             UC schema           (default: bluebird_ride_hailing)
  BLUEBIRD_PROFILE            CLI profile (local) (default: fevm-dante-classic-stable)
  BLUEBIRD_WAREHOUSE_ID       SQL warehouse id    (default: 114b2f7bfa1273b1)
  BLUEBIRD_SERVING_ENDPOINT   model serving name  (default: bluebird-maintenance)
  BLUEBIRD_EXPERIMENT_DIR     MLflow experiment parent dir
                              (default: /Shared/bluebird_ml)
  BLUEBIRD_LAKEBASE_PROJECT   Lakebase project id (default: bluebird-ops-db)
  BLUEBIRD_LAKEBASE_BRANCH    Lakebase branch resource path
  BLUEBIRD_LAKEBASE_CATALOG   UC catalog registered over the Lakebase DB
                              (default: bluebird_lakebase)
  BLUEBIRD_PG_DATABASE        Postgres database name (default: databricks_postgres)
"""
import os

CATALOG = os.environ.get("BLUEBIRD_CATALOG", "dante_classic_stable_catalog")
SCHEMA = os.environ.get("BLUEBIRD_SCHEMA", "bluebird_ride_hailing")
PROFILE = os.environ.get("BLUEBIRD_PROFILE", "fevm-dante-classic-stable")
WAREHOUSE_ID = os.environ.get("BLUEBIRD_WAREHOUSE_ID", "114b2f7bfa1273b1")
SERVING_ENDPOINT = os.environ.get("BLUEBIRD_SERVING_ENDPOINT", "bluebird-maintenance")
EXPERIMENT_DIR = os.environ.get("BLUEBIRD_EXPERIMENT_DIR", "/Shared/bluebird_ml")

# --- Lakebase (operational serving via synced tables) ---
LAKEBASE_PROJECT = os.environ.get("BLUEBIRD_LAKEBASE_PROJECT", "bluebird-ops-db")
LAKEBASE_BRANCH = os.environ.get(
    "BLUEBIRD_LAKEBASE_BRANCH", f"projects/{LAKEBASE_PROJECT}/branches/production"
)
LAKEBASE_CATALOG = os.environ.get("BLUEBIRD_LAKEBASE_CATALOG", "bluebird_lakebase")
PG_DATABASE = os.environ.get("BLUEBIRD_PG_DATABASE", "databricks_postgres")

# Gold tables the app serves from Lakebase (synced from UC Delta) -> primary key columns.
# Used by lakebase/setup_synced_tables.sh (create) and jobs/refresh_synced_tables.py (refresh).
SERVING_TABLES = {
    "gold_vehicle_predictions": ["vehicle_id"],
    "gold_zone_live": ["zone_id", "hour_of_day"],
    "gold_city_hourly": ["city", "hour_of_day"],
    "gold_trips_serving": ["trip_id"],
    "gold_demand_forecast": ["city", "forecast_ts"],
}

# Fully-qualified schema, e.g. "dante_classic_stable_catalog.bluebird_ride_hailing"
S = f"{CATALOG}.{SCHEMA}"


def fq(table: str) -> str:
    """Fully-qualify a table/view name in the Bluebird schema."""
    return f"{CATALOG}.{SCHEMA}.{table}"


def _on_databricks() -> bool:
    """Heuristic: are we running on Databricks compute (job task / notebook)?"""
    return any(
        os.environ.get(v)
        for v in ("DATABRICKS_RUNTIME_VERSION", "DB_IS_DRIVER", "SPARK_HOME", "DATABRICKS_HOST_IP")
    )


def get_spark():
    """Return a SparkSession that works both on Databricks and locally.

    - On Databricks (job task / notebook), reuse/attach to the ambient session.
    - Locally, connect via Databricks Connect (serverless) using BLUEBIRD_PROFILE.
    """
    # If a session already exists (notebook, or an earlier call), reuse it.
    try:
        from pyspark.sql import SparkSession

        active = SparkSession.getActiveSession()
        if active is not None:
            return active
        if _on_databricks():
            return SparkSession.builder.getOrCreate()
    except Exception:
        pass
    from databricks.connect import DatabricksSession

    return DatabricksSession.builder.profile(PROFILE).serverless(True).getOrCreate()
