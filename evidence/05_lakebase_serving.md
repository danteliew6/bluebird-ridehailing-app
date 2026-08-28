# Stage 5 — Lakebase operational serving (execution evidence)

The curated gold layer is loaded into **Lakebase Autoscaling** project
`bluebird-ops-db` (Postgres 17) and served to the app at OLTP latency. The
`bluebird-ops` app reads it through the AppKit `lakebase()` plugin via three
Express routes. Verified end-to-end against the **deployed** app 2026-08-28.

## Load: Delta gold → Lakebase Postgres (`lakebase/load_serving_tables.sh`)

```
== gold_vehicle_predictions:  delta_rows=700  postgres_rows=700
== gold_zone_live:            delta_rows=875  postgres_rows=875
== gold_city_hourly:          delta_rows=120  postgres_rows=120
== Granting SELECT to the app service principal ==
   granted SELECT to 71835aab-957e-4abf-b266-d2595f1d10a0
```

## Served through the deployed app (OAuth-authenticated GET)

```
$ TOKEN=$(databricks auth token --profile fevm-dante-classic-stable | jq -r .access_token)
$ curl -s -H "Authorization: Bearer $TOKEN" \
    https://bluebird-ops-7474647641788932.aws.databricksapps.com/api/lakebase/vehicle-worklist
```

| route | rows returned |
|---|---|
| `GET /api/lakebase/vehicle-worklist` | **50** |
| `GET /api/lakebase/city-hourly` | **120** |
| `GET /api/lakebase/zone-live` | **875** |

Sample row from `/api/lakebase/vehicle-worklist` (served from Postgres):

```json
{ "vehicle_id":"VEH-00149", "fleet_brand":"Golden Bird", "risk_pct":100,
  "anomaly_score":"1.000", "brake_wear_pct":"100.0", "battery_v":"11.56",
  "km_since_service":"10973", "needs_service_now":1 }
```

The app's **Fleet** service worklist and **Command Center** zone/city feeds now
read this data from Lakebase Postgres instead of re-aggregating on the SQL
warehouse — sub-second operational reads, refreshed every 20s.

> This workspace blocks `CREATE CATALOG` on the metastore, so the UC synced-table
> feature is unavailable here; we load the gold layer into Lakebase directly
> (`load_serving_tables.sh`). On a catalog-enabled workspace,
> `databricks postgres create-synced-table` (SNAPSHOT/TRIGGERED) is the drop-in
> replacement — same tables, same app reads.
