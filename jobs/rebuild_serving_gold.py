"""Rebuild the Lakebase serving-gold tables from curated trips (Lakeflow Job task).

Recomputes gold_zone_live and gold_city_hourly over the recent-30d window so the
Command Center's served state reflects the freshly-ingested micro-batch. Runs as a
serverless spark_python_task after the DQ pipeline task.
"""
from pyspark.sql import SparkSession

CATALOG = "dante_classic_stable_catalog"
SCHEMA = "bluebird_ride_hailing"
S = f"{CATALOG}.{SCHEMA}"

spark = SparkSession.builder.getOrCreate()

spark.sql(f"""
CREATE OR REPLACE TABLE {S}.gold_zone_live AS
SELECT z.zone_id, z.area_name, z.city, z.zone_type,
       ROUND(z.lat,4) AS lat, ROUND(z.lng,4) AS lng,
       hour(t.request_ts) AS hour_of_day, COUNT(*) AS demand,
       ROUND(AVG(CASE WHEN t.status='no_driver' THEN 1.0 ELSE 0 END),4) AS no_driver_rate,
       ROUND(AVG(t.surge_multiplier),2) AS avg_surge
FROM {S}.trips_curated_gold t
JOIN {S}.dim_zone z ON t.pickup_zone_id = z.zone_id
WHERE t.request_ts >= date_sub(current_date(),30)
GROUP BY 1,2,3,4,5,6,7
""")

spark.sql(f"""
CREATE OR REPLACE TABLE {S}.gold_city_hourly AS
SELECT city, hour(request_ts) AS hour_of_day, COUNT(*) AS trips,
       SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
       ROUND(AVG(CASE WHEN status='no_driver' THEN 1.0 ELSE 0 END),4) AS no_driver_rate,
       ROUND(AVG(CASE WHEN status='cancelled' THEN 1.0 ELSE 0 END),4) AS cancel_rate,
       ROUND(AVG(surge_multiplier),2) AS avg_surge, ROUND(AVG(wait_time_min),1) AS avg_wait_min
FROM {S}.trips_curated_gold
WHERE request_ts >= date_sub(current_date(),30)
GROUP BY 1,2
""")

# Curated trips + pickup zone — powers the Overview page aggregations from Postgres.
spark.sql(f"""
CREATE OR REPLACE TABLE {S}.gold_trips_serving AS
SELECT t.request_ts, t.city, t.status, t.fare_idr, t.surge_multiplier, t.rating,
       z.area_name AS pickup_area_name, z.zone_type AS pickup_zone_type
FROM {S}.trips_curated_gold t
LEFT JOIN {S}.dim_zone z ON t.pickup_zone_id = z.zone_id
""")

zl = spark.table(f"{S}.gold_zone_live").count()
ch = spark.table(f"{S}.gold_city_hourly").count()
ts = spark.table(f"{S}.gold_trips_serving").count()
print(f"REBUILT gold_zone_live={zl} rows, gold_city_hourly={ch} rows, gold_trips_serving={ts} rows.")
