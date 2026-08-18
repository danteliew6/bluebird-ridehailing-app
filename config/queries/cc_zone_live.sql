-- Command Center: per pickup-zone x hour-of-day demand + supply-gap signals (recent 30d).
-- lat/lng drive the spatial "live map" scatter; the client filters to the selected city + hour.
SELECT
  z.zone_id,
  z.area_name,
  z.city,
  z.zone_type,
  ROUND(z.lat, 4)                                                   AS lat,
  ROUND(z.lng, 4)                                                   AS lng,
  hour(t.request_ts)                                                AS hour_of_day,
  COUNT(*)                                                          AS demand,
  ROUND(AVG(CASE WHEN t.status = 'no_driver' THEN 1.0 ELSE 0 END), 4) AS no_driver_rate,
  ROUND(AVG(t.surge_multiplier), 2)                                 AS avg_surge
FROM dante_classic_stable_catalog.bluebird_ride_hailing.trips_curated_gold t
JOIN dante_classic_stable_catalog.bluebird_ride_hailing.dim_zone z
  ON t.pickup_zone_id = z.zone_id
WHERE t.request_ts >= date_sub(current_date(), 30)
GROUP BY 1, 2, 3, 4, 5, 6, 7
ORDER BY 3, 7;
