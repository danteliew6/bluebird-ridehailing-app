# Stage 5c — Overview/Fleet analytics served from Lakebase + live Command Center

Two follow-ups after live testing on the workspace: the Overview and Fleet pages
were still querying the **SQL warehouse** (slow, cold-start prone), and the Command
Center still ran a **simulated clock**. Both addressed here. Verified 2026-09-01.

## Why it was slow (measured)

The SQL warehouse is serverless with a 10-min auto-stop:

```
warehouse (warm) trips_by_city aggregation : ~3.1s
warehouse (cold, after idle)               : 10s+ first query
```

Every `useAnalyticsQuery` surface (Overview KPIs + 4 charts + top-zones, Fleet KPIs +
3 charts, the Command Center brand-risk) waited on that.

## Fix: serve those reads from Lakebase Postgres

Added `gold_trips_serving` (curated trips + pickup zone, 83,628 rows) and
`gold_demand_forecast` (35 rows) to Lakebase, and 10 sub-second read routes. Measured
through the **deployed** app (200 OK, row counts, wall-clock incl. app proxy round-trip):

```
overview-kpis      200  1.02s  rows=1
trips-by-city      200  1.03s  rows=5
revenue-by-day     200  1.03s  rows=17
top-zones          200  1.02s  rows=15
outcome-mix        200  1.00s  rows=3
nodriver-by-hour   200  1.04s  rows=24
fleet-kpis         200  0.99s  rows=1
risk-by-brand      200  1.00s  rows=4
forecast-by-day    200  0.99s  rows=7
forecast-by-city   200  1.00s  rows=5
```

Consistent ~1s with **no cold-start spikes** (vs 3s warm / 10s+ cold on the warehouse).
Numeric columns are cast `::int` / `::float8` so node-postgres returns real JS numbers:

```json
{"revenue_bn_idr": 0.78, "completed_trips": 12500, "cancellation_rate": 0.1053,
 "no_driver_rate": 0.0793, "avg_surge": 1.35, "avg_rating": 4.65}
types: {revenue_bn_idr: float, completed_trips: int, cancellation_rate: float, ...}
```

**Kept on the SQL warehouse on purpose:** the Governance / Data Access page. It reads
through the warehouse with Unity Catalog column-masks + row-filters applied — and those
FGAC controls do **not** propagate to Lakebase synced/served tables. Moving it would
silently defeat the governance demo, so it stays on the governed warehouse path.

## Command Center: genuinely live (not simulated)

- **LIVE by default**: pinned to the real current hour, auto-refreshing from Lakebase
  every 20s. As the ingestion job appends current-time trips, the view advances.
- The old sim-clock is now an optional **Replay** toggle (24h scrubber + play/pause) for
  walking through recent hours in a demo.
- All three Command Center feeds (city-hourly, zone-live, brand-risk) read from Lakebase.
