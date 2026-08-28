# Stage 5b — Lakebase write-back (execution evidence)

The app is not read-only: ops acts on an at-risk vehicle and the decision persists
to Lakebase. Reads come from `public.gold_*` (read-only, SP granted SELECT); writes
go to a separate app-owned schema `ops.service_orders` that the service principal
creates and owns at startup. Verified through the **deployed** app 2026-08-28.

## POST a decision (Fleet worklist → "Schedule service")

```
$ curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"vehicle_id":"VEH-00149","fleet_brand":"Golden Bird","risk_pct":100,
         "action":"schedule_service","note":"Brake wear 100%, battery low"}' \
    https://bluebird-ops-7474647641788932.aws.databricksapps.com/api/ops/service-orders
```

```json
{ "id":"f101b2b7-9ddc-4474-b9e9-a1c2a364da08", "vehicle_id":"VEH-00149",
  "fleet_brand":"Golden Bird", "risk_pct":100, "action":"schedule_service",
  "note":"Brake wear 100%, battery low", "created_by":"dante.liew@databricks.com",
  "created_at":"2026-08-28T07:56:43.579Z" }
```

## Read it back (persisted in Lakebase)

```
$ curl -s -H "Authorization: Bearer $TOKEN" \
    https://bluebird-ops-…/api/ops/service-orders
orders persisted: 1
latest: {"id":"f101b2b7-…","vehicle_id":"VEH-00149","action":"schedule_service", …}
```

The record survives in `ops.service_orders`; the Fleet worklist marks the vehicle
**✓ Scheduled** and the "Recent operational actions" panel lists it. `created_by`
is the authenticated app user (`x-forwarded-email`), so actions are attributable.
This closes the read→decide→**act** loop entirely on the governed platform.
