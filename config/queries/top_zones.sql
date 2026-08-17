SELECT z.area_name AS pickup_zone, z.city, z.zone_type,
       COUNT(*) AS trips,
       ROUND(SUM(t.fare_idr)/1e6, 1) AS revenue_m_idr,
       ROUND(AVG(t.surge_multiplier), 2) AS avg_surge
FROM dante_classic_stable_catalog.bluebird_ride_hailing.trips_curated_gold t
JOIN dante_classic_stable_catalog.bluebird_ride_hailing.dim_zone z ON t.pickup_zone_id = z.zone_id
GROUP BY 1,2,3 ORDER BY trips DESC LIMIT 15;
