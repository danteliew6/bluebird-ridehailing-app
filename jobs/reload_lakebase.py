"""Reload the Lakebase serving tables from Delta gold (Lakeflow Job final task).

After the pipeline + gold rebuild, refresh the Lakebase Postgres copies the app
serves. Reads the small gold tables via Spark and writes them into Postgres via
psycopg. The database credential is minted in-job via the same REST endpoint the
CLI uses (POST /api/2.0/postgres/credentials).

Requires (declared in the job task environment): psycopg[binary], databricks-sdk.
"""
import psycopg
from pyspark.sql import SparkSession
from databricks.sdk import WorkspaceClient

CATALOG = "dante_classic_stable_catalog"
SCHEMA = "bluebird_ride_hailing"
S = f"{CATALOG}.{SCHEMA}"
ENDPOINT = "projects/bluebird-ops-db/branches/production/endpoints/primary"
PGHOST = "ep-lucky-king-d2ewxj61.database.us-east-1.cloud.databricks.com"

# gold table -> (postgres table, ordered columns, pk cols for conflict-free reload)
TABLES = {
    "gold_vehicle_predictions": [
        "vehicle_id", "fleet_brand", "reading_date", "engine_temp_c", "brake_wear_pct",
        "battery_v", "km_since_service", "dtc_count", "anomaly_score", "vehicle_age",
        "needs_service_now", "service_risk_7d", "scored_at",
    ],
    "gold_zone_live": [
        "zone_id", "area_name", "city", "zone_type", "lat", "lng",
        "hour_of_day", "demand", "no_driver_rate", "avg_surge",
    ],
    "gold_city_hourly": [
        "city", "hour_of_day", "trips", "completed",
        "no_driver_rate", "cancel_rate", "avg_surge", "avg_wait_min",
    ],
}

spark = SparkSession.builder.getOrCreate()
w = WorkspaceClient()

# Mint a short-lived Lakebase credential (same call the CLI makes).
cred = w.api_client.do("POST", "/api/2.0/postgres/credentials", body={"endpoint": ENDPOINT})
token = cred["token"]
user = w.current_user.me().user_name

conn = psycopg.connect(host=PGHOST, user=user, password=token,
                       dbname="databricks_postgres", sslmode="require")
conn.autocommit = False
try:
    with conn.cursor() as cur:
        for tbl, cols in TABLES.items():
            rows = spark.table(f"{S}.{tbl}").select(*cols).collect()
            data = [tuple(r[c] for c in cols) for r in rows]
            placeholders = ",".join(["%s"] * len(cols))
            collist = ",".join(cols)
            cur.execute(f"TRUNCATE public.{tbl}")
            cur.executemany(
                f"INSERT INTO public.{tbl} ({collist}) VALUES ({placeholders})", data
            )
            cur.execute(f"SELECT count(*) FROM public.{tbl}")
            n = cur.fetchone()[0]
            print(f"RELOADED public.{tbl}: {len(data)} -> {n} rows")
    conn.commit()
    print("LAKEBASE RELOAD COMMITTED")
except Exception:
    conn.rollback()
    raise
finally:
    conn.close()
