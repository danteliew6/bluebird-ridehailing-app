"""Bootstrap stage runner — the single entrypoint for every serverless job task.

Serverless job environments cannot set arbitrary environment variables (the spec
only supports `client` + `dependencies`). This wrapper bridges that gap: the DABs
job passes the target catalog/schema/etc. as task `parameters` in the form
`--bb-catalog=<x>`, and this runner promotes each into the `BLUEBIRD_*` environment
variable BEFORE importing `bluebird_config`. It then executes the requested stage
script exactly as if it had been launched directly (so the stage scripts need no
job-specific code).

Usage (as a spark_python_task):
    bootstrap/run.py <stage> --bb-catalog=<c> --bb-schema=<s> [--bb-...] [extra argv]

`--bb-foo-bar=baz`  ->  os.environ["BLUEBIRD_FOO_BAR"] = "baz"
Any non `--bb-` argv is forwarded to the stage script as its own sys.argv
(e.g. the gen_stream_batch batch size).
"""
import os
import runpy
import sys

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# stage name -> repo-relative script path
STAGES = {
    # data generation
    "gen_dims": "data_gen/gen_dims.py",
    "gen_bronze": "data_gen/gen_bronze.py",
    "gen_facts": "data_gen/gen_facts.py",
    "add_comments": "data_gen/add_comments.py",
    # governance + metrics
    "apply_governance": "governance/apply_governance.py",
    "create_metric_views": "bootstrap/create_metric_views.py",
    "build_serving_gold": "bootstrap/build_serving_gold.py",
    # ML
    "train_maintenance": "ml/train_bluebird_ml.py",
    "reserve_proba": "ml/reserve_proba.py",
    "train_demand_forecast": "ml/train_demand_forecast.py",
    # realtime ingest
    "gen_stream_batch": "jobs/gen_stream_batch.py",
    "rebuild_serving_gold": "jobs/rebuild_serving_gold.py",
    "refresh_synced_tables": "jobs/refresh_synced_tables.py",
}


def main(argv):
    passthrough = []
    for arg in argv:
        if arg.startswith("--bb-") and "=" in arg:
            key, val = arg[len("--bb-"):].split("=", 1)
            env_key = "BLUEBIRD_" + key.upper().replace("-", "_")
            os.environ[env_key] = val
        else:
            passthrough.append(arg)

    if not passthrough:
        raise SystemExit(f"usage: run.py <stage> [--bb-key=val ...] [args]; stages={list(STAGES)}")

    stage = passthrough[0]
    if stage not in STAGES:
        raise SystemExit(f"unknown stage '{stage}'; known: {list(STAGES)}")

    script = os.path.join(_REPO_ROOT, STAGES[stage])
    print(f"[bootstrap] stage={stage} script={STAGES[stage]} "
          f"catalog={os.environ.get('BLUEBIRD_CATALOG', '(default)')} "
          f"schema={os.environ.get('BLUEBIRD_SCHEMA', '(default)')}")
    # Run the stage script as __main__ with its own argv (stage name stripped).
    sys.argv = [script] + passthrough[1:]
    runpy.run_path(script, run_name="__main__")


if __name__ == "__main__":
    main(sys.argv[1:])
