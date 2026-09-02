"""Bootstrap task — build the operational-serving gold tables.

Reads lakebase/build_serving_gold.sql, re-points it at the configured
catalog.schema, and runs each statement. These small gold tables
(gold_zone_live, gold_city_hourly, gold_trips_serving) are what the Lakebase
synced tables copy into Postgres for the app's low-latency operational reads
(see lakebase/setup_synced_tables.sh). gold_vehicle_predictions and
gold_demand_forecast are produced by the ML stage.

Runs as a serverless spark_python_task in the DABs bootstrap job.
"""
import os
import sys

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from bluebird_config import S, get_spark  # noqa: E402

_ORIGIN = "dante_classic_stable_catalog.bluebird_ride_hailing"
_SQL_FILE = os.path.join(_REPO_ROOT, "lakebase", "build_serving_gold.sql")


def statements(sql: str):
    """Split a multi-statement SQL file on ';', dropping comments/blank lines."""
    for raw in sql.split(";"):
        # strip whole-line SQL comments so a comment-only chunk isn't run
        lines = [ln for ln in raw.splitlines() if not ln.strip().startswith("--")]
        stmt = "\n".join(lines).strip()
        if stmt:
            yield stmt


def main():
    spark = get_spark()
    with open(_SQL_FILE) as f:
        sql = f.read().replace(_ORIGIN, S)
    for i, stmt in enumerate(statements(sql), 1):
        print(f"[serving-gold] statement {i} ...")
        spark.sql(stmt)
    print(f"[serving-gold] done, target schema {S}")


if __name__ == "__main__":
    main()
