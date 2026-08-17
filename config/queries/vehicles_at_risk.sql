SELECT vehicle_id, fleet_brand,
       ROUND(anomaly_score, 3) AS anomaly_score,
       ROUND(brake_wear_pct, 1) AS brake_wear_pct,
       ROUND(battery_v, 2) AS battery_v,
       CAST(ROUND(km_since_service) AS BIGINT) AS km_since_service,
       needs_service_now
FROM dante_classic_stable_catalog.bluebird_ride_hailing.gold_vehicle_predictions
WHERE service_risk_7d >= 0.5
ORDER BY anomaly_score DESC LIMIT 50;
