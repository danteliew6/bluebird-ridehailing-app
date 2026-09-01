-- ============================================================================
-- Bluebird operational-serving gold tables (fed into Lakebase Postgres)
-- ----------------------------------------------------------------------------
-- The Command Center polls live ops state every 20s. Rather than re-aggregate
-- 90k trips over a 30-day window on the SQL warehouse on every poll, we
-- pre-materialize the hot-path operational state into small gold tables and
-- sync them into Lakebase Postgres for low-latency operational reads.
--
-- Synced to Lakebase:
--   gold_zone_live         -> Command Center live zone-demand map
--   gold_city_hourly       -> Command Center city-health timeline
--   gold_vehicle_predictions (already exists) -> Fleet service worklist
-- ============================================================================

-- Live per pickup-zone x hour-of-day demand + supply-gap signals (recent 30d).
CREATE OR REPLACE TABLE dante_classic_stable_catalog.bluebird_ride_hailing.gold_zone_live AS
SELECT
  z.zone_id,
  z.area_name,
  z.city,
  z.zone_type,
  ROUND(z.lat, 4)                                                     AS lat,
  ROUND(z.lng, 4)                                                     AS lng,
  hour(t.request_ts)                                                  AS hour_of_day,
  COUNT(*)                                                            AS demand,
  ROUND(AVG(CASE WHEN t.status = 'no_driver' THEN 1.0 ELSE 0 END), 4) AS no_driver_rate,
  ROUND(AVG(t.surge_multiplier), 2)                                   AS avg_surge
FROM dante_classic_stable_catalog.bluebird_ride_hailing.trips_curated_gold t
JOIN dante_classic_stable_catalog.bluebird_ride_hailing.dim_zone z
  ON t.pickup_zone_id = z.zone_id
WHERE t.request_ts >= date_sub(current_date(), 30)
GROUP BY 1, 2, 3, 4, 5, 6, 7;

-- Live per city x hour-of-day operational signals (recent 30d).
CREATE OR REPLACE TABLE dante_classic_stable_catalog.bluebird_ride_hailing.gold_city_hourly AS
SELECT
  city,
  hour(request_ts)                                                    AS hour_of_day,
  COUNT(*)                                                            AS trips,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)               AS completed,
  ROUND(AVG(CASE WHEN status = 'no_driver' THEN 1.0 ELSE 0 END), 4)   AS no_driver_rate,
  ROUND(AVG(CASE WHEN status = 'cancelled' THEN 1.0 ELSE 0 END), 4)   AS cancel_rate,
  ROUND(AVG(surge_multiplier), 2)                                     AS avg_surge,
  ROUND(AVG(wait_time_min), 1)                                        AS avg_wait_min
FROM dante_classic_stable_catalog.bluebird_ride_hailing.trips_curated_gold
WHERE request_ts >= date_sub(current_date(), 30)
GROUP BY 1, 2;

-- Curated trips (all-time) + pickup zone — serves the Overview page aggregations
-- from Postgres (KPIs, trips-by-city, revenue-by-day, top-zones, outcome-mix, no-driver-by-hour).
CREATE OR REPLACE TABLE dante_classic_stable_catalog.bluebird_ride_hailing.gold_trips_serving AS
SELECT t.request_ts, t.city, t.status, t.fare_idr, t.surge_multiplier, t.rating,
       z.area_name AS pickup_area_name, z.zone_type AS pickup_zone_type
FROM dante_classic_stable_catalog.bluebird_ride_hailing.trips_curated_gold t
LEFT JOIN dante_classic_stable_catalog.bluebird_ride_hailing.dim_zone z ON t.pickup_zone_id = z.zone_id;

-- (gold_demand_forecast is produced by ml/train_demand_forecast.py; it is loaded into
--  Lakebase as-is to serve the Fleet & Forecast charts.)
