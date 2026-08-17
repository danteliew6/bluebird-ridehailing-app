SELECT COUNT(*) AS fleet_size,
       SUM(CASE WHEN service_risk_7d >= 0.5 THEN 1 ELSE 0 END) AS at_risk_7d,
       SUM(needs_service_now) AS need_now,
       ROUND(AVG(anomaly_score), 3) AS avg_anomaly
FROM dante_classic_stable_catalog.bluebird_ride_hailing.gold_vehicle_predictions;
