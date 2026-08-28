# BUILD — reproduce the Bluebird journey

Every stage runs against Databricks workspace `fevm-dante-classic-stable` in catalog/schema
`dante_classic_stable_catalog.bluebird_ride_hailing`. All data is **synthetic** — no real
customer data is used. Captured outputs for each stage are in [`evidence/`](./evidence) and the
executed walkthrough is [`notebooks/bluebird_journey.ipynb`](./notebooks/bluebird_journey.ipynb).

## Prerequisites

- **Databricks CLI** ≥ v1.3 authenticated to the workspace:
  `databricks auth login --host https://fevm-dante-classic-stable.cloud.databricks.com --profile fevm-dante-classic-stable`
- **Python 3** with `databricks-connect` (serverless) for the data-gen / ML scripts
- **Node.js 22+** and **npm** for the app
- **psql** (libpq) for the Lakebase load
- SQL warehouse id `114b2f7bfa1273b1` (used by the CLI query helper below)

Helper used throughout:
`databricks experimental aitools tools query -w 114b2f7bfa1273b1 --profile fevm-dante-classic-stable "<SQL>"`

## Stage 1 — Lakeflow ingest + data quality

```bash
# 1a. Generate synthetic raw telemetry + dims/facts (Databricks Connect, serverless)
python3 data_gen/gen_dims.py
python3 data_gen/gen_bronze.py      # ~90.9k raw trip events, ~8-9% seeded defects
python3 data_gen/gen_facts.py
python3 data_gen/add_comments.py

# 1b. Run the Lakeflow DQ pipeline (bronze -> silver/quarantine -> curated gold)
#     SQL: governance/pipeline/bluebird_dq_pipeline.sql  (pipeline id 83464893-…-633f026db12c)
databricks pipelines start-update 83464893-0567-4198-b580-633f026db12c --profile fevm-dante-classic-stable
```

Verify → [evidence/01_lakeflow_ingest_dq.md](./evidence/01_lakeflow_ingest_dq.md).

## Stage 2 — Unity Catalog governance

```bash
python3 governance/apply_governance.py   # PII tags, column masks, city row filter, allowlist UDF
```

Verify → [evidence/02_unity_catalog_governance.md](./evidence/02_unity_catalog_governance.md).

## Stage 3 — ML + Model Serving

```bash
python3 ml/train_bluebird_ml.py       # XGBoost service-risk model + Optuna HPO -> UC @prod
python3 ml/reserve_proba.py           # pyfunc probability wrapper (@prod) -> gold_vehicle_predictions
python3 ml/train_demand_forecast.py   # XGBoost 7-day demand forecast -> gold_demand_forecast
# endpoint 'bluebird-maintenance' serves the wrapper; test:
databricks serving-endpoints query bluebird-maintenance --profile fevm-dante-classic-stable \
  --json '{"dataframe_records":[{"engine_temp_c":118,"brake_wear_pct":95,"battery_v":11.2,"km_since_service":13500,"dtc_count":4,"anomaly_score":0.82,"vehicle_age":11}]}'
```

Verify → [evidence/03_ml_and_serving.md](./evidence/03_ml_and_serving.md).

## Stage 4 — Genie Room

Import/refresh the Genie space from [`genie/genie_agent.json`](./genie/genie_agent.json)
(space id `01f19a33de0a1111ab1e0302d7c0b8c7`, EN + Bahasa). Sample questions run as SQL →
[evidence/04_genie_business_queries.md](./evidence/04_genie_business_queries.md).

## Stage 5 — Lakebase operational serving

```bash
# 5a. Build the two serving-gold tables (materialize CC aggregations)
databricks experimental aitools tools query -w 114b2f7bfa1273b1 --profile fevm-dante-classic-stable \
  "$(cat lakebase/build_serving_gold.sql)"   # run each statement (see file)

# 5b. Create the Lakebase Autoscaling project (once)
databricks postgres create-project bluebird-ops-db \
  --json '{"spec":{"display_name":"Bluebird Ops (Lakebase)"}}' --profile fevm-dante-classic-stable

# 5c. Load gold -> Postgres and grant the app SP read access
./lakebase/load_serving_tables.sh
```

> This workspace blocks `CREATE CATALOG`, so UC synced tables aren't available; we load gold into
> Postgres directly (see the note in `lakebase/postgres_ddl.sql`). On a catalog-enabled workspace,
> `databricks postgres create-synced-table` is the drop-in replacement.

Verify → [evidence/05_lakebase_serving.md](./evidence/05_lakebase_serving.md).

## Stage 6 — the Databricks App

```bash
npm install
npm run build                 # -> dist/server.js + client/dist/
databricks apps validate --profile fevm-dante-classic-stable

# bind resources (sql-warehouse, genie-space, serving-endpoint, postgres) — merge, don't replace:
databricks apps create-update bluebird-ops --json @<(cat <<'JSON'
{"update_mask":"resources","app":{"resources":[
  {"name":"sql-warehouse","sql_warehouse":{"id":"114b2f7bfa1273b1","permission":"CAN_USE"}},
  {"name":"genie-space","genie_space":{"name":"bluebird_data","space_id":"01f19a33de0a1111ab1e0302d7c0b8c7","permission":"CAN_RUN"}},
  {"name":"serving-endpoint","serving_endpoint":{"name":"bluebird-maintenance","permission":"CAN_QUERY"}},
  {"name":"postgres","postgres":{"branch":"projects/bluebird-ops-db/branches/production","database":"projects/bluebird-ops-db/branches/production/databases/databricks-postgres","permission":"CAN_CONNECT_AND_CREATE"}}
]}}
JSON
) --profile fevm-dante-classic-stable

# deploy from git (this workspace is git-source only; commit dist/ + client/dist first)
git add -f dist/server.js client/dist && git commit -m "build" && git push origin main
databricks apps deploy bluebird-ops --json '{"git_source":{"branch":"main","source_code_path":""}}' --profile fevm-dante-classic-stable
```

### Local app dev

```bash
npm run dev     # hot-reload; set server/.env with PGHOST/PGDATABASE/LAKEBASE_ENDPOINT for Lakebase
npm run lint && npm run typecheck
```

> **Deploy before local Lakebase dev** so the app service principal owns/receives its Postgres
> role; then `lakebase/load_serving_tables.sh` grants it SELECT on the served tables.

## Regenerate the executed notebook

```bash
python3 notebooks/build_journey_nb.py   # -> notebooks/bluebird_journey.ipynb
```
