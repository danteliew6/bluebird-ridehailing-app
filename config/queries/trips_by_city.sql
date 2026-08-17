SELECT city, COUNT(*) AS trips
FROM dante_classic_stable_catalog.bluebird_ride_hailing.trips_curated_gold
GROUP BY 1 ORDER BY 2 DESC;
