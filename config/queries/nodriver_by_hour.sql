SELECT hour(request_ts) AS hour_of_day,
       ROUND(AVG(CASE WHEN status='no_driver' THEN 1.0 ELSE 0 END), 4) AS no_driver_rate
FROM dante_classic_stable_catalog.bluebird_ride_hailing.trips_curated_gold
WHERE city = 'Jakarta'
GROUP BY 1 ORDER BY 1;
