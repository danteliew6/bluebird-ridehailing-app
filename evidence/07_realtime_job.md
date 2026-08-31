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

## Post-review fix verified — realistic trip durations

A code review caught that `gen_stream_batch` put `duration_min` in `make_interval`'s
HOURS slot, inflating each live trip's dropoff by ~60×. After the fix (commit
`cd5a0ee`), a fresh run produces realistic durations — isolated by ingest minute:

```
$ …query "SELECT date_format(_ingest_ts,'HH:mm') ingest_min, COUNT(*) rows,
           AVG(dropoff-pickup)/60 avg_trip_min FROM …bronze WHERE trip_id LIKE 'RT-%' …"
02:08  335 rows  avg_trip_min 1436.1   (pre-fix run)
02:15  332 rows  avg_trip_min 1294.3   (pre-fix run)
02:26  341 rows  avg_trip_min   23.2   <- FIXED run: realistic taxi trip length
```

(The pre-fix rows remain in bronze on purpose — it is a streaming source, so deleting
from it would break the DLT pipeline. They are immaterial: the `duration_min` column
was always correct; only the derived dropoff timestamp was off, and the app/dashboards
key off `duration_min` and `request_ts`, not the dropoff delta.)

## Notes

- Scripts only ever **append** to bronze; overwriting would break the streaming source.
- `reload_lakebase` deliberately uses **no Spark** and the pure-Python **pg8000** driver
  (an earlier `psycopg` build aborted the serverless kernel with a libpq/Spark native
  clash). It reads gold via the SQL Statement Execution API and mints its Lakebase
  credential in-job via `POST /api/2.0/postgres/credentials`.
- Schedule is **paused** by default (cost only per run); unpause to go live (see BUILD.md).
