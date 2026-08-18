-- @param persona STRING
WITH me AS (
  SELECT COALESCE(MAX(is_admin), false) AS is_admin,
         COALESCE(MAX(allowed_city), 'NONE') AS allowed_city
  FROM dante_classic_stable_catalog.bluebird_ride_hailing.driver_access_allowlist
  WHERE email = :persona
)
SELECT
  d.driver_id,
  CASE WHEN me.is_admin THEN d.driver_name ELSE concat('•••', right(d.driver_name, 2)) END AS driver_name,
  CASE WHEN me.is_admin THEN d.phone ELSE concat('•••••', right(d.phone, 3)) END AS phone,
  CASE WHEN me.is_admin THEN d.nik ELSE 'REDACTED-PII' END AS nik,
  d.home_city,
  d.fleet_brand
FROM dante_classic_stable_catalog.bluebird_ride_hailing.dim_driver d
CROSS JOIN me
WHERE me.is_admin OR me.allowed_city = 'ALL' OR d.home_city = me.allowed_city
ORDER BY d.driver_id
LIMIT 100;
