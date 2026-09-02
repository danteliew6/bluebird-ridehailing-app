# Bluebird — One Governed Platform for Live Mobility Operations

An end-to-end Databricks prototype for **Bluebird Group (PT Blue Bird Tbk)**, Indonesia's
largest taxi and ride-hailing operator, in the **ground-transportation / mobility** industry.
It replaces a fragmented stack (BigQuery warehouse + AWS QuickSight BI + self-built OSS ML,
monitoring and governance) with a single governed lakehouse that ingests, governs, predicts,
answers, serves, and surfaces operational data — so ops can *catch and act on* the Jakarta
evening-peak driver shortage instead of finding out after riders have churned.

> **Live app:** https://bluebird-ops-7474647641788932.aws.databricksapps.com (state: RUNNING)
> **Reproduce the build:** [BUILD.md](./BUILD.md) · **Execution evidence:** [evidence/](./evidence)
>
> **Replicate the whole thing in another workspace (one command):** the solution is
> packaged as a **Declarative Automation Bundle** ([`databricks.yml`](./databricks.yml) +
> [`resources/`](./resources)). Pipeline, jobs, app and dashboard are DAB resources; a
> single bootstrap job reproduces the data journey; Lakebase serving uses **synced tables**;
> the **Genie space** is a DAB resource the app binds to automatically.
> ```bash
> ./replicate.sh --profile <target-profile> --catalog <c> --schema <s> --warehouse <id>
> ```
> See [BUILD.md](./BUILD.md) for the full flow.

---

## The customer problem (specific, not "improve operations")

Bluebird's stack is siloed, so it fails during live incidents. In the recurring **Jakarta
17:00–20:00 driver-shortage window**, ~**1 in 4** ride requests find **no driver** and surge
pins at **2.15×** (see [evidence/04](./evidence/04_genie_business_queries.md)) — riders abandon,
drivers are mispositioned, and there is no single governed view to react in time. Meanwhile the
premium **Golden Bird** fleet degrades toward breakdowns with no predictive signal (avg 7-day
service risk **0.773**, see [evidence/03](./evidence/03_ml_and_serving.md)), and ~**8.3%** of raw
trip telemetry is dirty and flows downstream unquarantined
([evidence/01](./evidence/01_lakeflow_ingest_dq.md)).

## The solution — an integrated journey on one platform

| # | Stage | What it does here | Code | Evidence (readable text) |
|---|-------|-------------------|------|--------------------------|
| 1 | **Lakeflow** | Ingest raw synthetic trip telemetry (near-real-time via a scheduled **Lakeflow Job**); 6 DQ expectations; quarantine ~8.3% bad rows; curate gold | [`governance/pipeline/`](./governance/pipeline), [`data_gen/`](./data_gen), [`jobs/`](./jobs) | [01_lakeflow_ingest_dq.md](./evidence/01_lakeflow_ingest_dq.md), [07_realtime_job.md](./evidence/07_realtime_job.md) |
| 2 | **Unity Catalog** | Tag PII, mask columns, city-scoped ABAC row filter; admin allowlist bypass | [`governance/apply_governance.py`](./governance/apply_governance.py) | [02_unity_catalog_governance.md](./evidence/02_unity_catalog_governance.md) |
| 3 | **ML / AI** | XGBoost 7-day service-risk model + demand forecast; served via Model Serving | [`ml/`](./ml) | [03_ml_and_serving.md](./evidence/03_ml_and_serving.md) |
| 4 | **Genie Room** | Natural-language Q&A (EN + Bahasa) over governed tables | [`genie/genie_agent.json`](./genie/genie_agent.json) | [04_genie_business_queries.md](./evidence/04_genie_business_queries.md) |
| 5 | **Lakebase** | Curated gold synced into Lakebase Postgres via **synced tables** (Delta → Postgres); served to the app at OLTP latency; **write-back** of ops decisions to an app-owned schema | [`lakebase/`](./lakebase) | [05_lakebase_serving.md](./evidence/05_lakebase_serving.md), [06_lakebase_writeback.md](./evidence/06_lakebase_writeback.md) |
| 6 | **Databricks App** | AppKit React ops console; Overview/Fleet/Command Center served sub-second from Lakebase, Command Center is **live** (real current hour, auto-refresh) | [`client/`](./client), [`server/`](./server) | live app + [notebook](./notebooks/bluebird_journey.ipynb), [08_analytics_on_lakebase.md](./evidence/08_analytics_on_lakebase.md) |

A single executed walkthrough of all six stages (with outputs) lives at
[`notebooks/bluebird_journey.ipynb`](./notebooks/bluebird_journey.ipynb).

## Business outcome (buyer KPIs)

- **Ride fulfillment** — pre-position drivers from the demand forecast + live Command Center
  alerts to cut the Jakarta evening failure spike (target: 24% → ~15% no-driver).
- **Revenue protection** — Jakarta is ~63% of revenue; recovered completed trips flow straight
  to the top line.
- **Fleet uptime** — predictive service on the ~95 highest-risk vehicles avoids roadside
  breakdowns and lost vehicle-days.
- **Rider retention** — lower peak surge (2.15× → ~1.6×) defends against Gojek/Grab.
- **Trust + consolidation** — DQ + governance make the numbers trustworthy; one platform retires
  BigQuery + QuickSight + OSS ML/governance/monitoring.

Full business framing is in the presentation deck (see the submission form / `docs/`).

## The app (Stage 6)

AppKit React + Express app, deployed git-source to Databricks Apps. Pages: **Command Center**
(live-ops cockpit — LIVE by default at the real current hour, auto-refreshing from Lakebase every
20s, with an optional Replay scrubber; zone-demand map + alert feed), **Overview** (KPIs + charts,
served sub-second from Lakebase), **Fleet & Forecast** (Lakebase service worklist with **write-back**
+ live model what-if), **Ask Bluebird** (Genie chat + embedded Genie room), **Data Access** (persona
masking/row-filter preview — kept on the governed SQL-warehouse path so UC FGAC applies), **AI/BI
Dashboard** (embedded Lakeview), **Architecture**.

**Data access split:** operational/overview reads are served from **Lakebase Postgres** (sub-second,
no warehouse cold-start); the Governance page stays on the **SQL warehouse** because Unity Catalog
column-masks and row-filters don't propagate to Lakebase — that page must show governance live.

## Where things live

```
data_gen/    Lakeflow ingest source (synthetic telemetry)      genie/      Genie space config
governance/  UC governance + DQ pipeline SQL                   lakebase/   gold build + Postgres load
ml/          model training + scoring                          dashboard/  AI/BI dashboard + SQL
jobs/        real-time ingestion Lakeflow Job scripts          evidence/   per-stage run outputs (text)
client/ server/ shared/ config/   the AppKit app               notebooks/  executed journey walkthrough
```

### Real-time ingestion (Lakeflow Job)

`bluebird-realtime-ingest` (job id `943223034248444`, scheduled every 10 min, paused by default)
runs the near-real-time loop: **append a fresh synthetic micro-batch** (current-time trips) →
**run the DQ pipeline** → **rebuild serving gold** → **reload Lakebase**. This replaces the app's
simulated clock with data that genuinely advances — see [BUILD.md](./BUILD.md) and
[evidence/07_realtime_job.md](./evidence/07_realtime_job.md).

**Workspace:** `fevm-dante-classic-stable` · **Catalog/schema:**
`dante_classic_stable_catalog.bluebird_ride_hailing` · **Data is synthetic** — no real customer data.
