-- @param persona STRING
WITH me AS (
  SELECT COALESCE(MAX(is_admin), false) AS is_admin,
         COALESCE(MAX(allowed_city), 'NONE') AS allowed_city
  FROM dante_classic_stable_catalog.bluebird_ride_hailing.driver_access_allowlist
  WHERE email = :persona
)
SELECT
  me.is_admin AS pii_visible,
  me.allowed_city AS allowed_city,
  (SELECT COUNT(*) FROM dante_classic_stable_catalog.bluebird_ride_hailing.fact_trip t
     WHERE me.is_admin OR me.allowed_city = 'ALL' OR t.city = me.allowed_city) AS visible_trips,
  (SELECT COUNT(DISTINCT t.city) FROM dante_classic_stable_catalog.bluebird_ride_hailing.fact_trip t
     WHERE me.is_admin OR me.allowed_city = 'ALL' OR t.city = me.allowed_city) AS visible_cities
FROM me;
