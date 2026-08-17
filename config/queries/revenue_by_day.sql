SELECT to_date(request_ts) AS day, ROUND(SUM(fare_idr)/1e9, 3) AS revenue_bn_idr
FROM dante_classic_stable_catalog.bluebird_ride_hailing.trips_curated_gold
WHERE request_ts >= date_sub(current_date(), 30)
GROUP BY 1 ORDER BY 1;
