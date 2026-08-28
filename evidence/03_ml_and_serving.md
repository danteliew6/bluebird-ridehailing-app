# Stage 3 — ML predictive maintenance + Model Serving (execution evidence)

An XGBoost model (`ml/train_bluebird_ml.py`, Optuna HPO) predicts 7-day service
risk per vehicle; a pyfunc wrapper (`ml/reserve_proba.py`, `@prod`) is served by
endpoint **`bluebird-maintenance`** and scored to `gold_vehicle_predictions`.
A second XGBoost model (`ml/train_demand_forecast.py`) forecasts city demand.
Run 2026-08-28.

## Prediction distribution by fleet brand (`gold_vehicle_predictions`)

```
$ …query "SELECT fleet_brand, COUNT(*) vehicles,
            SUM(CASE WHEN service_risk_7d>=0.7 THEN 1 ELSE 0 END) high_risk_ge70,
            SUM(needs_service_now) need_now, ROUND(AVG(service_risk_7d),3) avg_risk
          FROM …gold_vehicle_predictions GROUP BY fleet_brand ORDER BY high_risk_ge70 DESC"
```

| fleet_brand | vehicles | high_risk ≥70% | need_now | avg_risk |
|---|---|---|---|---|
| Silver Bird | 189 | 37 | 14 | 0.236 |
| Bluebird | 477 | 32 | 23 | 0.071 |
| **Golden Bird** | 32 | 25 | 21 | **0.773** |
| Big Bird | 2 | 1 | 1 | 0.521 |

The premium **Golden Bird** fleet shows by far the highest average risk (0.773)
— the degrading-premium-vehicle story, quantified.

## Live Model Serving response (endpoint `bluebird-maintenance`)

```
$ databricks serving-endpoints query bluebird-maintenance --json '{"dataframe_records":[
    {"engine_temp_c":118,"brake_wear_pct":95,"battery_v":11.2,"km_since_service":13500,
     "dtc_count":4,"anomaly_score":0.82,"vehicle_age":11},
    {"engine_temp_c":92,"brake_wear_pct":40,"battery_v":12.6,"km_since_service":3000,
     "dtc_count":0,"anomaly_score":0.15,"vehicle_age":3}]}'
```

```json
{ "predictions": [
    { "service_risk_7d": 0.9999676942825317 },   // heavily degraded vehicle
    { "service_risk_7d": 0.000090555171482265 }  // healthy vehicle
] }
```

The served model cleanly separates a degraded vehicle (**99.997%** 7-day service
risk) from a healthy one (**0.009%**). This endpoint also powers the app's Fleet
"what-if" scorer.
