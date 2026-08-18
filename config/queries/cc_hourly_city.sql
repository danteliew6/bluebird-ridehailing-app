-- Command Center: per city x hour-of-day operational signals (recent 30d).
-- Fetched once; the client sim-clock re-selects the current hour slice to feel live.
SELECT
  city,
  hour(request_ts)                                                AS hour_of_day,
  COUNT(*)                                                        AS trips,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)           AS completed,
  ROUND(AVG(CASE WHEN status = 'no_driver' THEN 1.0 ELSE 0 END), 4) AS no_driver_rate,
  ROUND(AVG(CASE WHEN status = 'cancelled' THEN 1.0 ELSE 0 END), 4) AS cancel_rate,
  ROUND(AVG(surge_multiplier), 2)                                 AS avg_surge,
  ROUND(AVG(wait_time_min), 1)                                    AS avg_wait_min
FROM dante_classic_stable_catalog.bluebird_ride_hailing.trips_curated_gold
WHERE request_ts >= date_sub(current_date(), 30)
GROUP BY 1, 2
ORDER BY 1, 2;
