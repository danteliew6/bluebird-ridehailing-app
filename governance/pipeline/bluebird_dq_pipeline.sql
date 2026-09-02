-- Bluebird Lakeflow pipeline — bronze -> silver (DQ expectations) -> gold.
-- Demonstrates the "data cleansing + pipeline monitoring" story: ~9% of raw events
-- violate a quality rule and are dropped (and captured in a quarantine table), with
-- per-expectation pass/fail metrics visible in the pipeline event log.

-- ============================ SILVER (typed + expectations) ============================
CREATE OR REFRESH STREAMING TABLE trips_silver
(
  CONSTRAINT valid_driver       EXPECT (driver_id IS NOT NULL)                                        ON VIOLATION DROP ROW,
  CONSTRAINT valid_fare         EXPECT (fare_idr >= 0)                                                 ON VIOLATION DROP ROW,
  CONSTRAINT valid_request_ts   EXPECT (request_ts IS NOT NULL)                                        ON VIOLATION DROP ROW,
  CONSTRAINT positive_distance  EXPECT (status <> 'completed' OR distance_km > 0)                      ON VIOLATION DROP ROW,
  CONSTRAINT valid_trip_window  EXPECT (status <> 'completed' OR dropoff_ts > pickup_ts)               ON VIOLATION DROP ROW,
  CONSTRAINT valid_payment      EXPECT (payment_method IN ('ewallet','card','cash','corporate'))       ON VIOLATION DROP ROW
)
COMMENT 'Cleansed, typed trips. Rows violating any DQ rule are dropped (see trips_quarantine).'
AS SELECT
  trip_id, driver_id, vehicle_id, customer_id,
  pickup_zone_id, dropoff_zone_id, city, fleet_brand, service_type,
  to_timestamp(request_ts)                 AS request_ts,
  to_timestamp(pickup_ts)                  AS pickup_ts,
  to_timestamp(dropoff_ts)                 AS dropoff_ts,
  try_cast(distance_km      AS DOUBLE)     AS distance_km,
  try_cast(duration_min     AS DOUBLE)     AS duration_min,
  try_cast(fare_idr         AS BIGINT)     AS fare_idr,
  try_cast(surge_multiplier AS DOUBLE)     AS surge_multiplier,
  payment_method,
  try_cast(rating           AS DOUBLE)     AS rating,
  try_cast(wait_time_min    AS DOUBLE)     AS wait_time_min,
  status
FROM STREAM(trip_events_bronze);

-- ============================ QUARANTINE (rejected rows + reason) ============================
CREATE OR REFRESH STREAMING TABLE trips_quarantine
COMMENT 'Rows rejected by data-quality rules, labelled with the failure reason.'
AS SELECT
  *,
  CASE
    WHEN driver_id IS NULL                                                              THEN 'null_driver'
    WHEN to_timestamp(request_ts) IS NULL                                               THEN 'malformed_timestamp'
    WHEN try_cast(fare_idr AS DOUBLE) < 0                                               THEN 'negative_fare'
    WHEN payment_method NOT IN ('ewallet','card','cash','corporate')                    THEN 'invalid_payment_method'
    WHEN status = 'completed' AND try_cast(distance_km AS DOUBLE) <= 0                   THEN 'non_positive_distance'
    WHEN status = 'completed' AND to_timestamp(dropoff_ts) <= to_timestamp(pickup_ts)   THEN 'dropoff_before_pickup'
    ELSE 'other'
  END AS reject_reason,
  current_timestamp() AS quarantined_at
FROM STREAM(trip_events_bronze)
WHERE driver_id IS NULL
   OR to_timestamp(request_ts) IS NULL
   OR try_cast(fare_idr AS DOUBLE) < 0
   OR payment_method NOT IN ('ewallet','card','cash','corporate')
   OR (status = 'completed' AND try_cast(distance_km AS DOUBLE) <= 0)
   OR (status = 'completed' AND to_timestamp(dropoff_ts) <= to_timestamp(pickup_ts));

-- ============================ GOLD: curated (dedup + derived) ============================
CREATE OR REFRESH MATERIALIZED VIEW trips_curated_gold
COMMENT 'Clean, de-duplicated trips with derived revenue and peak-hour flag.'
AS SELECT * EXCEPT (rn) FROM (
  SELECT
    *,
    (hour(request_ts) BETWEEN 6 AND 9 OR hour(request_ts) BETWEEN 17 AND 20) AS is_peak_hour,
    row_number() OVER (PARTITION BY trip_id ORDER BY request_ts) AS rn
  FROM trips_silver
) WHERE rn = 1;

-- ============================ GOLD: daily fleet monitoring summary ============================
CREATE OR REFRESH MATERIALIZED VIEW fleet_daily_gold
COMMENT 'Daily city x fleet KPI summary from curated trips (for monitoring / dashboard).'
AS SELECT
  to_date(request_ts)                                                       AS trip_date,
  city,
  fleet_brand,
  count(*)                                                                  AS trips,
  sum(fare_idr)                                                             AS revenue_idr,
  round(avg(surge_multiplier), 2)                                           AS avg_surge,
  round(100 * avg(CASE WHEN status <> 'completed' THEN 1 ELSE 0 END), 1)    AS fail_rate_pct,
  round(avg(CASE WHEN status = 'completed' THEN wait_time_min END), 1)      AS avg_wait_min
FROM trips_curated_gold
GROUP BY 1, 2, 3;
