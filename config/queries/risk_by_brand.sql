SELECT fleet_brand, SUM(CASE WHEN service_risk_7d >= 0.5 THEN 1 ELSE 0 END) AS at_risk_7d
FROM dante_classic_stable_catalog.bluebird_ride_hailing.gold_vehicle_predictions
GROUP BY 1 ORDER BY 2 DESC;
