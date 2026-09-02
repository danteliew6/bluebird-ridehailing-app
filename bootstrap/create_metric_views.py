"""Bootstrap task — create the Unity Catalog metric views.

Reads the metric-view definitions from dashboard/*.sql, re-points them at the
configured catalog.schema, and creates them with a single spark.sql() call each
(the YAML-body `WITH METRICS` statement must NOT be split on ';'). Runs as a
serverless spark_python_task in the DABs bootstrap job.
"""
import os
import sys

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from bluebird_config import S, get_spark  # noqa: E402

# The original (source-workspace) fully-qualified schema the .sql files were written against.
_ORIGIN = "dante_classic_stable_catalog.bluebird_ride_hailing"

METRIC_VIEW_FILES = [
    os.path.join(_REPO_ROOT, "dashboard", "trip_metrics.sql"),
    os.path.join(_REPO_ROOT, "dashboard", "fleet_health_metrics.sql"),
]


def main():
    spark = get_spark()
    for path in METRIC_VIEW_FILES:
        with open(path) as f:
            sql = f.read().replace(_ORIGIN, S)
        print(f"[metric-view] applying {os.path.basename(path)} against {S} ...")
        spark.sql(sql)
        print(f"[metric-view] OK: {os.path.basename(path)}")


if __name__ == "__main__":
    main()
