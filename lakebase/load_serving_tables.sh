#!/usr/bin/env bash
# ============================================================================
# Load Bluebird curated-gold tables from Unity Catalog Delta into Lakebase
# Postgres for operational serving by the bluebird-ops app.
#
# Usage:  ./lakebase/load_serving_tables.sh
# Env:    PROFILE (default fevm-dante-classic-stable), WAREHOUSE_ID, APP_NAME
# ============================================================================
set -euo pipefail

PROFILE="${PROFILE:-fevm-dante-classic-stable}"
WAREHOUSE_ID="${WAREHOUSE_ID:-114b2f7bfa1273b1}"
APP_NAME="${APP_NAME:-bluebird-ops}"
PROJECT="bluebird-ops-db"
BRANCH="projects/${PROJECT}/branches/production"
EP="${BRANCH}/endpoints/primary"
CATALOG="dante_classic_stable_catalog"
SCHEMA="bluebird_ride_hailing"
PGUSER="dante.liew@databricks.com"
TABLES=(gold_vehicle_predictions gold_zone_live gold_city_hourly)
HERE="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"

echo "== Resolving Lakebase endpoint + short-lived credential =="
HOST=$(databricks postgres get-endpoint "$EP" --profile "$PROFILE" -o json \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['status']['hosts']['host'])")
TOKEN=$(databricks postgres generate-database-credential "$EP" --profile "$PROFILE" -o json \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
PGCONN="host=$HOST user=$PGUSER dbname=databricks_postgres sslmode=require"
echo "   host=$HOST"

echo "== Creating Postgres tables + indexes =="
PGPASSWORD="$TOKEN" psql "$PGCONN" -v ON_ERROR_STOP=1 -q -f "$HERE/postgres_ddl.sql"

for T in "${TABLES[@]}"; do
  echo "== $T: export from Delta -> load into Postgres =="
  databricks experimental aitools tools query -w "$WAREHOUSE_ID" --profile "$PROFILE" -o csv \
    "SELECT * FROM ${CATALOG}.${SCHEMA}.${T}" > "$TMP/$T.csv"
  SRC=$(($(wc -l < "$TMP/$T.csv") - 1))
  PGPASSWORD="$TOKEN" psql "$PGCONN" -v ON_ERROR_STOP=1 -q \
    -c "TRUNCATE public.$T;" \
    -c "\copy public.$T FROM '$TMP/$T.csv' WITH (FORMAT csv, HEADER true)"
  DST=$(PGPASSWORD="$TOKEN" psql "$PGCONN" -tAc "SELECT count(*) FROM public.$T;")
  printf "   delta_rows=%s  postgres_rows=%s\n" "$SRC" "$DST"
done

echo "== Granting SELECT to the app service principal =="
SP=$(databricks apps get "$APP_NAME" --profile "$PROFILE" -o json \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('service_principal_client_id',''))" 2>/dev/null || true)
if [ -n "$SP" ]; then
  PGPASSWORD="$TOKEN" psql "$PGCONN" -v ON_ERROR_STOP=1 -q \
    -c "GRANT USAGE ON SCHEMA public TO \"$SP\";" \
    -c "GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"$SP\";" \
    -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO \"$SP\";"
  echo "   granted SELECT to $SP"
else
  echo "   (app SP not found — deploy the app, then re-run to grant)"
fi

rm -rf "$TMP"
echo "== Done =="
