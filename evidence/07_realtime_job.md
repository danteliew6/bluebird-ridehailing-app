# Stage 1b — Real-time ingestion via Lakeflow Job (execution evidence)

The batch demo is now a **near-real-time** flow orchestrated by the Lakeflow Job
`bluebird-realtime-ingest` (job id `943223034248444`, git-sourced from this public
repo, scheduled every 10 min, paused by default). Verified end-to-end 2026-08-31.

## The job DAG (4 serverless tasks)

```
gen_stream_batch  ->  run_dq_pipeline  ->  rebuild_serving_gold  ->  reload_lakebase
```

## Successful run 109868913978398 — task outputs

```
overall: TERMINATED SUCCESS
  gen_stream_batch     = SUCCESS
  run_dq_pipeline      = SUCCESS
  rebuild_serving_gold = SUCCESS
  reload_lakebase      = SUCCESS
```

```
gen_stream_batch:      APPENDED 400 fresh trips to bronze (current-time). bronze total now 91706.
rebuild_serving_gold:  REBUILT gold_zone_live=875 rows, gold_city_hourly=120 rows.
reload_lakebase:       RELOADED public.gold_vehicle_predictions: 700 read -> 700 rows in Postgres
                       RELOADED public.gold_zone_live: 875 read -> 875 rows in Postgres
                       RELOADED public.gold_city_hourly: 120 read -> 120 rows in Postgres
                       LAKEBASE RELOAD COMMITTED
```

## Data genuinely advances

```
$ …query "SELECT COUNT(*) FROM …trip_events_bronze WHERE trip_id LIKE 'RT-%'"
RT-* rows in bronze: 800        # fresh current-time trips accumulated across runs
```

Each run appends a new micro-batch of **current-time** trips (`RT-<ts>-*`), the DQ
pipeline processes them (bronze is read as a STREAM), the serving gold is rebuilt,
and Lakebase is reloaded — so the app's live-ops surfaces reflect data that moves,
not a fixed snapshot with a simulated clock.

## Notes

- Scripts only ever **append** to bronze; overwriting would break the streaming source.
- `reload_lakebase` deliberately uses **no Spark** and the pure-Python **pg8000** driver
  (an earlier `psycopg` build aborted the serverless kernel with a libpq/Spark native
  clash). It reads gold via the SQL Statement Execution API and mints its Lakebase
  credential in-job via `POST /api/2.0/postgres/credentials`.
- Schedule is **paused** by default (cost only per run); unpause to go live (see BUILD.md).
