SELECT
  ROUND(SUM(fare_idr)/1e9, 2)                                   AS revenue_bn_idr,
  SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END)           AS completed_trips,
  ROUND(AVG(CASE WHEN status='cancelled' THEN 1.0 ELSE 0 END),4) AS cancellation_rate,
  ROUND(AVG(CASE WHEN status='no_driver' THEN 1.0 ELSE 0 END),4) AS no_driver_rate,
  ROUND(AVG(surge_multiplier), 2)                              AS avg_surge,
  ROUND(AVG(rating), 2)                                        AS avg_rating
FROM dante_classic_stable_catalog.bluebird_ride_hailing.trips_curated_gold
WHERE request_ts >= date_sub(current_date(), 30);
