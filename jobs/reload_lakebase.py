"""Reload the Lakebase serving tables from Delta gold (Lakeflow Job final task).

After the pipeline + gold rebuild, refresh the Lakebase Postgres copies the app
serves. Deliberately uses NO SparkSession and NO native Postgres driver: it reads
the (tiny) gold tables via the SQL Statement Execution REST API and writes them
with pg8000 (a PURE-PYTHON Postgres driver) — avoiding the libpq/Spark native
clash that aborts the kernel. The DB credential is minted in-job via the same
REST endpoint the CLI uses (POST /api/2.0/postgres/credentials).

Requires (declared in the job task environment): pg8000, databricks-sdk.
"""
import ssl
import pg8000.dbapi
from databricks.sdk import WorkspaceClient

CATALOG = "dante_classic_stable_catalog"
SCHEMA = "bluebird_ride_hailing"
S = f"{CATALOG}.{SCHEMA}"
WAREHOUSE_ID = "114b2f7bfa1273b1"
ENDPOINT = "projects/bluebird-ops-db/branches/production/endpoints/primary"
PGHOST = "ep-lucky-king-d2ewxj61.database.us-east-1.cloud.databricks.com"

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

w = WorkspaceClient()


def coerce(value, type_name):
    if value is None:
        return None
    t = (type_name or "").upper()
    if t in ("INT", "INTEGER", "SHORT", "BYTE", "LONG", "BIGINT"):
        return int(float(value))
    if t in ("DOUBLE", "FLOAT", "DECIMAL", "REAL"):
        return float(value)
    return value


def read_gold(table, cols):
    stmt = w.statement_execution.execute_statement(
        warehouse_id=WAREHOUSE_ID,
        statement=f"SELECT {', '.join(cols)} FROM {S}.{table}",
        wait_timeout="50s",
    )
    schema = stmt.manifest.schema.columns
    types = [c.type_name.value if hasattr(c.type_name, "value") else str(c.type_name) for c in schema]
    data = (stmt.result.data_array or []) if stmt.result else []
    return [[coerce(cell, types[i]) for i, cell in enumerate(row)] for row in data]


# Mint a short-lived Lakebase credential (same call the CLI makes).
cred = w.api_client.do("POST", "/api/2.0/postgres/credentials", body={"endpoint": ENDPOINT})
token = cred["token"]
user = w.current_user.me().user_name

con = pg8000.dbapi.connect(
    user=user, host=PGHOST, port=5432, database="databricks_postgres",
    password=token, ssl_context=ssl.create_default_context(),
)
try:
    cur = con.cursor()
    for tbl, cols in TABLES.items():
        rows = read_gold(tbl, cols)
        placeholders = ",".join(["%s"] * len(cols))
        cur.execute(f"TRUNCATE public.{tbl}")
        if rows:
            cur.executemany(f"INSERT INTO public.{tbl} ({','.join(cols)}) VALUES ({placeholders})", rows)
        cur.execute(f"SELECT count(*) FROM public.{tbl}")
        n = cur.fetchone()[0]
        print(f"RELOADED public.{tbl}: {len(rows)} read -> {n} rows in Postgres")
    con.commit()
    print("LAKEBASE RELOAD COMMITTED")
except Exception:
    con.rollback()
    raise
finally:
    con.close()
