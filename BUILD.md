# BUILD — package & replicate the Bluebird solution (DAB)

The whole solution is packaged as a **Declarative Automation Bundle (DAB)** so it
can be reproduced in another workspace with a handful of commands. All data is
**synthetic** — no real customer data. Everything is parameterized off bundle
variables (catalog, schema, warehouse, Lakebase project, …); the `source` target
reproduces the original build on `fevm-dante-classic-stable`, and the `replica`
target is a fill-in-the-blank template for a new workspace.

## What the bundle contains

| DAB resource | File | Notes |
|---|---|---|
| Pipeline `bluebird_dq_pipeline` | `resources/pipeline.yml` | bronze → silver/quarantine → curated gold (SQL in `governance/pipeline/`) |
| Job `bluebird-bootstrap` | `resources/job_bootstrap.yml` | one-shot data + governance + metric views + ML + serving gold |
| Job `bluebird-realtime-ingest` | `resources/job_realtime.yml` | near-real-time gen → DQ → gold → **refresh synced tables** (schedule PAUSED) |
| App `bluebird-ops` | `resources/app.yml` | AppKit control center, deployed from bundle-synced workspace files |
| Dashboard `Bluebird Ops` | `resources/dashboard.yml` | AI/BI Lakeview dashboard |
| Genie space `bluebird_data` | `resources/genie.yml` | NL Q&A space; `serialized_space` inlined from `genie/genie_agent.json` at deploy. The app binds to it via `${resources.genie_spaces.bluebird_genie.id}` — no manual import. |

Not DAB-native (provisioned by the replicate flow):
- **Lakebase synced tables** — created via `lakebase/setup_synced_tables.sh`
  (the DAB `synced_database_tables` resource is deprecated and fails on current
  Lakebase, so the supported `databricks postgres create-synced-table` CLI is used).

`bootstrap/run.py` is the single entrypoint for every serverless job task: it
promotes `--bb-*` task parameters into `BLUEBIRD_*` env vars before importing
`bluebird_config`, so the stage scripts (`data_gen/`, `governance/`, `ml/`,
`jobs/`, `bootstrap/`) need no job-specific code and re-point at any workspace.

## Prerequisites

- Databricks CLI ≥ v1.3, authenticated: `databricks auth login --host <workspace> --profile <profile>`
- `psql` (libpq) for the Lakebase SP grant
- Node 22+ / npm only for local app dev (the platform builds the app on deploy)

## Reproduce on the original workspace (`source`)

```bash
./replicate.sh --target source --profile fevm-dante-classic-stable
```

That runs, in dependency order: retarget static assets (no-op on source) → create
the Lakebase project → `bundle deploy` (pipeline, jobs, app, dashboard, **and the
Genie space**) → `bundle run bluebird_bootstrap` → Lakebase synced-table setup +
app-SP grant. No manual Genie step.

## Replicate into a NEW workspace (`replica`)

1. Edit `databricks.yml` → `targets.replica`: set `workspace.host` (and, if you
   prefer, the variable defaults).
2. Run, passing the target catalog/schema/warehouse as flags — `replicate.sh`
   forwards them to the bundle as `--var` and exports the matching `BLUEBIRD_*`
   env for the shell steps (render + Lakebase), so everything lines up:
   ```bash
   ./replicate.sh --profile <your-profile> \
       --catalog <catalog> --schema <schema> --warehouse <warehouse-id>
   ```
   (`--target replica` is the default.) The Genie space is created by the bundle
   and the app binds to it automatically — nothing manual.

> The bundle is fully parameterized; step 0 of `replicate.sh` also retargets the
> catalog-qualified content that DABs doesn't substitute for you: the app SQL
> (`config/queries/*.sql`), the dashboard JSON, and the Genie space's `data_sources`
> (`genie/genie_agent.json`) — when the replica catalog/schema differs from the original.

## Individual bundle commands

```bash
databricks bundle validate -t source --profile <profile>
databricks bundle deploy   -t source --profile <profile>
databricks bundle run bluebird_bootstrap        -t source --profile <profile>
databricks bundle run bluebird_realtime_ingest  -t source --profile <profile>   # on demand
```

Unpause the realtime schedule when you want it live (it only costs per run):
edit `resources/job_realtime.yml` `pause_status: UNPAUSED` and redeploy.

## Local app dev

```bash
npm install && npm run dev     # set server/.env with PGHOST/PGDATABASE/LAKEBASE_ENDPOINT for Lakebase
npm run lint && npm run typecheck
```

> Deploy the app before local Lakebase dev so the app service principal owns its
> Postgres role; `lakebase/setup_synced_tables.sh` then grants it SELECT.

## Regenerate the executed notebook

```bash
python3 notebooks/build_journey_nb.py   # -> notebooks/bluebird_journey.ipynb
```

Captured per-stage evidence lives in [`evidence/`](./evidence).
