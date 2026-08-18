-- @param persona STRING
WITH me AS (
  SELECT COALESCE(MAX(is_admin), false) AS is_admin,
         COALESCE(MAX(allowed_city), 'NONE') AS allowed_city
  FROM dante_classic_stable_catalog.bluebird_ride_hailing.driver_access_allowlist
  WHERE email = :persona
)
SELECT t.city, COUNT(*) AS trips, ROUND(SUM(t.fare_idr)/1e9, 2) AS revenue_bn_idr
FROM dante_classic_stable_catalog.bluebird_ride_hailing.fact_trip t
CROSS JOIN me
WHERE me.is_admin OR me.allowed_city = 'ALL' OR t.city = me.allowed_city
GROUP BY t.city
ORDER BY trips DESC;
