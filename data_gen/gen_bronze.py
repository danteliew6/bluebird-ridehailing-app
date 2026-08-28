"""Phase 1c — trip_events_bronze: raw ingested events (all strings) with intentional dirt.

Drives the Lakeflow data-quality / expectations story: ~9% of rows violate a rule
(null driver, non-positive fare, dropoff<=pickup, bad payment enum, zero distance,
malformed timestamp) plus duplicate trip_ids.
"""
from pyspark.sql import functions as F
from common import get_spark, fq

spark = get_spark()
src = spark.table(fq("fact_trip"))

# raw string representation
raw = src.select(
    "trip_id", "driver_id", "vehicle_id", "customer_id", "pickup_zone_id", "dropoff_zone_id",
    "city", "fleet_brand", "service_type",
    F.date_format("request_ts", "yyyy-MM-dd HH:mm:ss").alias("request_ts"),
    F.date_format("pickup_ts", "yyyy-MM-dd HH:mm:ss").alias("pickup_ts"),
    F.date_format("dropoff_ts", "yyyy-MM-dd HH:mm:ss").alias("dropoff_ts"),
    F.col("distance_km").cast("string").alias("distance_km"),
    F.col("duration_min").cast("string").alias("duration_min"),
    F.col("fare_idr").cast("string").alias("fare_idr"),
    F.col("surge_multiplier").cast("string").alias("surge_multiplier"),
    "payment_method",
    F.col("rating").cast("string").alias("rating"),
    F.col("wait_time_min").cast("string").alias("wait_time_min"),
    "status",
).withColumn("_r", F.rand(101))

# inject dirt on disjoint bands (~9% total)
dirty = (raw
    # 0.00-0.020 : null driver_id
    .withColumn("driver_id", F.when(F.col("_r") < 0.020, F.lit(None)).otherwise(F.col("driver_id")))
    # 0.020-0.038 : non-positive fare on completed
    .withColumn("fare_idr", F.when((F.col("_r") >= 0.020) & (F.col("_r") < 0.038) & (F.col("status") == "completed"),
                                   F.lit("-1500")).otherwise(F.col("fare_idr")))
    # 0.038-0.052 : dropoff before pickup (swap) on completed
    .withColumn("dropoff_ts", F.when((F.col("_r") >= 0.038) & (F.col("_r") < 0.052) & (F.col("status") == "completed"),
                                     F.col("pickup_ts")).otherwise(F.col("dropoff_ts")))
    .withColumn("pickup_ts", F.when((F.col("_r") >= 0.038) & (F.col("_r") < 0.052) & (F.col("status") == "completed"),
                                    F.col("dropoff_ts")).otherwise(F.col("pickup_ts")))
    # 0.052-0.066 : invalid payment_method
    .withColumn("payment_method", F.when((F.col("_r") >= 0.052) & (F.col("_r") < 0.066), F.lit("UNKNOWN"))
                .otherwise(F.col("payment_method")))
    # 0.066-0.078 : zero/negative distance on completed
    .withColumn("distance_km", F.when((F.col("_r") >= 0.066) & (F.col("_r") < 0.078) & (F.col("status") == "completed"),
                                      F.lit("0")).otherwise(F.col("distance_km")))
    # 0.078-0.090 : malformed request_ts
    .withColumn("request_ts", F.when((F.col("_r") >= 0.078) & (F.col("_r") < 0.090), F.lit("N/A"))
                .otherwise(F.col("request_ts")))
    .withColumn("_ingest_ts", F.current_timestamp())
    .drop("_r"))

# duplicate ~1% of trip_ids (append a resampled copy)
dupes = dirty.sample(fraction=0.01, seed=7)
bronze = dirty.unionByName(dupes)

bronze.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(fq("trip_events_bronze"))
total = spark.table(fq("trip_events_bronze")).count()
print(f"trip_events_bronze: {total} rows")

# quick DQ profile
spark.sql(f"""
SELECT
  round(100*avg(CASE WHEN driver_id IS NULL THEN 1 ELSE 0 END),2) pct_null_driver,
  round(100*avg(CASE WHEN cast(fare_idr as double) <= 0 AND status='completed' THEN 1 ELSE 0 END),2) pct_bad_fare,
  round(100*avg(CASE WHEN payment_method NOT IN ('ewallet','card','cash','corporate') THEN 1 ELSE 0 END),2) pct_bad_pay,
  round(100*avg(CASE WHEN request_ts = 'N/A' THEN 1 ELSE 0 END),2) pct_bad_ts
FROM {fq('trip_events_bronze')}
""").show()
print("BRONZE DONE")
