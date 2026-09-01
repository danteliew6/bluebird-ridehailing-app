-- ============================================================================
-- Lakebase Postgres schema for Bluebird operational serving
-- ----------------------------------------------------------------------------
-- Three curated gold tables loaded from Unity Catalog Delta into Lakebase
-- Postgres for low-latency operational reads by the bluebird-ops app:
--   gold_vehicle_predictions -> Fleet service worklist (ML risk scores)
--   gold_zone_live           -> Command Center live zone-demand map
--   gold_city_hourly         -> Command Center city-health timeline
--
-- NOTE: this workspace blocks CREATE CATALOG on the metastore, so the UC
-- "synced table" feature (which registers a Lakebase-bound UC catalog) is not
-- available here. We instead load the gold layer into Postgres directly via
-- load_serving_tables.sh — an equally valid operational-serving pattern. In a
-- workspace with catalog-create rights, `databricks postgres create-synced-table`
-- (SNAPSHOT/TRIGGERED) would replace this loader.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.gold_vehicle_predictions (
  vehicle_id        TEXT,
  fleet_brand       TEXT,
  reading_date      TIMESTAMPTZ,
  engine_temp_c     DOUBLE PRECISION,
  brake_wear_pct    DOUBLE PRECISION,
  battery_v         DOUBLE PRECISION,
  km_since_service  DOUBLE PRECISION,
  dtc_count         DOUBLE PRECISION,
  anomaly_score     DOUBLE PRECISION,
  vehicle_age       DOUBLE PRECISION,
  needs_service_now INTEGER,
  service_risk_7d   DOUBLE PRECISION,
  scored_at         TIMESTAMPTZ,
  PRIMARY KEY (vehicle_id)
);

CREATE TABLE IF NOT EXISTS public.gold_zone_live (
  zone_id        TEXT,
  area_name      TEXT,
  city           TEXT,
  zone_type      TEXT,
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  hour_of_day    INTEGER,
  demand         BIGINT,
  no_driver_rate NUMERIC(15,4),
  avg_surge      DOUBLE PRECISION,
  PRIMARY KEY (zone_id, hour_of_day)
);

CREATE TABLE IF NOT EXISTS public.gold_city_hourly (
  city           TEXT,
  hour_of_day    INTEGER,
  trips          BIGINT,
  completed      BIGINT,
  no_driver_rate NUMERIC(15,4),
  cancel_rate    NUMERIC(15,4),
  avg_surge      DOUBLE PRECISION,
  avg_wait_min   DOUBLE PRECISION,
  PRIMARY KEY (city, hour_of_day)
);

-- Curated trips (all-time) + pickup zone — powers the Overview page aggregations
-- (KPIs, trips-by-city, revenue-by-day, top-zones, outcome-mix, no-driver-by-hour)
-- entirely from Postgres instead of the SQL warehouse.
CREATE TABLE IF NOT EXISTS public.gold_trips_serving (
  request_ts        TIMESTAMPTZ,
  city              TEXT,
  status            TEXT,
  fare_idr          BIGINT,
  surge_multiplier  DOUBLE PRECISION,
  rating            DOUBLE PRECISION,
  pickup_area_name  TEXT,
  pickup_zone_type  TEXT
);

-- 7-day demand forecast — powers the Fleet & Forecast charts.
CREATE TABLE IF NOT EXISTS public.gold_demand_forecast (
  city            TEXT,
  forecast_ts     TIMESTAMPTZ,
  trips_forecast  DOUBLE PRECISION,
  trips_upper     DOUBLE PRECISION,
  trips_lower     DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS idx_vpred_risk   ON public.gold_vehicle_predictions (service_risk_7d DESC);
CREATE INDEX IF NOT EXISTS idx_zone_cityhr  ON public.gold_zone_live (city, hour_of_day);
CREATE INDEX IF NOT EXISTS idx_city_hr      ON public.gold_city_hourly (city, hour_of_day);
CREATE INDEX IF NOT EXISTS idx_trips_ts     ON public.gold_trips_serving (request_ts);
CREATE INDEX IF NOT EXISTS idx_trips_city   ON public.gold_trips_serving (city);
