# Stage 1 — Lakeflow ingest + data quality (execution evidence)

Raw synthetic trip telemetry is ingested by the Lakeflow pipeline
`bluebird_dq_pipeline` (`governance/pipeline/bluebird_dq_pipeline.sql`), which
enforces 6 DQ expectations and quarantines bad records before curating gold.

- **Pipeline id:** `83464893-0567-4198-b580-633f026db12c`
- **Last update:** `705cfcd8-4a7d-4028-adf5-c45d51b2fee7` — state **COMPLETED**

## Medallion row counts (run 2026-08-28)

```
$ databricks experimental aitools tools query -w 114b2f7bfa1273b1 \
    "SELECT 'trip_events_bronze', COUNT(*) FROM …trip_events_bronze
     UNION ALL SELECT 'trips_silver', COUNT(*) FROM …trips_silver
     UNION ALL SELECT 'trips_quarantine', COUNT(*) FROM …trips_quarantine
     UNION ALL SELECT 'trips_curated_gold', COUNT(*) FROM …trips_curated_gold
     UNION ALL SELECT 'fact_trip', COUNT(*) FROM …fact_trip"
```

| table | rows |
|---|---|
| trip_events_bronze | 90,906 |
| trips_silver | 83,347 |
| trips_quarantine | 7,559 |
| trips_curated_gold | 82,521 |
| fact_trip | 90,000 |

## Data-quality quarantine rate

```
$ …query "SELECT ROUND(100.0*(SELECT COUNT(*) FROM …trips_quarantine)
           /(SELECT COUNT(*) FROM …trip_events_bronze),2) AS quarantine_pct"
[ { "quarantine_pct": "8.32" } ]
```

**8.32%** of raw bronze records fail the DQ expectations and are quarantined
rather than flowing into curated gold — this is the "dirty cleansing flow" the
customer struggles with today, solved at the ingest boundary.
