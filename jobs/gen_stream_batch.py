"""Real-time ingestion — append a fresh micro-batch of synthetic trips to bronze.

Run as a serverless spark_python_task inside the Lakeflow Job. Samples existing
trips (guarantees referential integrity with the dims), re-stamps them with the
CURRENT time, re-injects the same ~9% data-quality dirt, and APPENDS to
trip_events_bronze. The DQ pipeline reads bronze as a STREAM, so each batch flows
bronze -> silver/quarantine -> curated gold on the next pipeline run.

IMPORTANT: only ever APPEND here — overwriting bronze would break the streaming
source and force a full pipeline refresh.
"""
import sys
from pyspark.sql import SparkSession, functions as F

CATALOG = "dante_classic_stable_catalog"
SCHEMA = "bluebird_ride_hailing"
FQ = lambda t: f"{CATALOG}.{SCHEMA}.{t}"

# batch size (arg 1, default 400) — small so each ~5-min run is cheap
N = int(sys.argv[1]) if len(sys.argv) > 1 else 400

spark = SparkSession.builder.getOrCreate()

# Sample real trips -> valid FKs; restamp to "now"; recompute a fresh trip_id.
base = (
    spark.table(FQ("fact_trip"))
    .orderBy(F.rand())
    .limit(N)
    .withColumn("_offset_s", (F.rand() * 300).cast("int"))          # request within last 5 min
    .withColumn("request_ts_t", F.current_timestamp() - F.make_interval(F.lit(0), F.lit(0), F.lit(0), F.lit(0), F.lit(0), F.lit(0), F.col("_offset_s")))
    .withColumn("_pickup_wait", (F.rand() * 480 + 60).cast("int"))  # 1-9 min to pickup
    .withColumn("pickup_ts_t", F.col("request_ts_t") + F.make_interval(F.lit(0), F.lit(0), F.lit(0), F.lit(0), F.lit(0), F.lit(0), F.col("_pickup_wait")))
    .withColumn("dropoff_ts_t", F.col("pickup_ts_t") + F.make_interval(F.lit(0), F.lit(0), F.lit(0), F.lit(0), F.col("duration_min").cast("int"), F.lit(0), F.lit(0)))
    # fresh unique trip_id so dedup keeps them
    .withColumn("trip_id", F.concat(F.lit("RT-"), F.date_format(F.current_timestamp(), "yyyyMMddHHmmss"), F.lit("-"), F.monotonically_increasing_id().cast("string")))
)

# Cast to the bronze string schema (raw ingest representation).
raw = base.select(
    "trip_id", "driver_id", "vehicle_id", "customer_id", "pickup_zone_id", "dropoff_zone_id",
    "city", "fleet_brand", "service_type",
    F.date_format("request_ts_t", "yyyy-MM-dd HH:mm:ss").alias("request_ts"),
    F.date_format("pickup_ts_t", "yyyy-MM-dd HH:mm:ss").alias("pickup_ts"),
    F.date_format("dropoff_ts_t", "yyyy-MM-dd HH:mm:ss").alias("dropoff_ts"),
    F.col("distance_km").cast("string").alias("distance_km"),
    F.col("duration_min").cast("string").alias("duration_min"),
    F.col("fare_idr").cast("string").alias("fare_idr"),
    F.col("surge_multiplier").cast("string").alias("surge_multiplier"),
    "payment_method",
    F.col("rating").cast("string").alias("rating"),
    F.col("wait_time_min").cast("string").alias("wait_time_min"),
    "status",
).withColumn("_r", F.rand())

# Re-inject the same disjoint-band dirt (~9%) so the DQ story keeps running live.
dirty = (raw
    .withColumn("driver_id", F.when(F.col("_r") < 0.020, F.lit(None)).otherwise(F.col("driver_id")))
    .withColumn("fare_idr", F.when((F.col("_r") >= 0.020) & (F.col("_r") < 0.038) & (F.col("status") == "completed"), F.lit("-1500")).otherwise(F.col("fare_idr")))
    .withColumn("payment_method", F.when((F.col("_r") >= 0.052) & (F.col("_r") < 0.066), F.lit("UNKNOWN")).otherwise(F.col("payment_method")))
    .withColumn("distance_km", F.when((F.col("_r") >= 0.066) & (F.col("_r") < 0.078) & (F.col("status") == "completed"), F.lit("0")).otherwise(F.col("distance_km")))
    .withColumn("request_ts", F.when((F.col("_r") >= 0.078) & (F.col("_r") < 0.090), F.lit("N/A")).otherwise(F.col("request_ts")))
    .withColumn("_ingest_ts", F.current_timestamp())
    .drop("_r"))

dirty.write.mode("append").saveAsTable(FQ("trip_events_bronze"))

appended = dirty.count()
total = spark.table(FQ("trip_events_bronze")).count()
print(f"APPENDED {appended} fresh trips to bronze (current-time). bronze total now {total}.")
