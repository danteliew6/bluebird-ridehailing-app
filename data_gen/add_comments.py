"""Phase 1d — table + column comments for Genie / catalog discoverability."""
from common import get_spark, fq

spark = get_spark()

TABLE_COMMENTS = {
    "fact_trip": "Completed/cancelled/no_driver ride-hailing trips (gold). One row per trip request. "
                 "fare_idr in Indonesian Rupiah; status='no_driver' means no driver was matched. "
                 "Jakarta evening peak in the most recent 30 days shows elevated cancellations/surge.",
    "fact_vehicle_health": "Daily vehicle telematics readings (gold). anomaly_score in [0,1]; "
                           "needs_service_flag=1 when the vehicle requires maintenance. Older Golden Bird / "
                           "Big Bird vehicles degrade fastest.",
    "dim_driver": "Driver master. Contains PII (driver_name, phone, nik). fleet_brand is the Bluebird sub-brand.",
    "dim_vehicle": "Vehicle master, 1:1 with driver by *_idx. fleet_brand matches the assigned driver.",
    "dim_customer": "Customer master. Contains PII (customer_name, phone, email). member_tier is loyalty level.",
    "dim_zone": "Pickup/dropoff zones across 5 Indonesian cities. zone_type in cbd/residential/airport/mall/transport_hub.",
    "trip_events_bronze": "RAW ingested trip events (all strings) with intentional data-quality defects "
                          "(~9%): null driver, non-positive fare, dropoff<=pickup, bad payment enum, zero "
                          "distance, malformed timestamp, plus duplicate trip_ids. Source for the Lakeflow pipeline.",
    "driver_access_allowlist": "UNGOVERNED access map (email -> allowed_city, is_admin) powering the "
                               "column-mask and row-filter demo bypass.",
}

COL_COMMENTS = {
    "fact_trip": {
        "trip_id": "Unique trip identifier",
        "fare_idr": "Total fare charged in Indonesian Rupiah (0 for cancelled/no_driver)",
        "surge_multiplier": "Dynamic pricing multiplier (1.0 = no surge)",
        "status": "completed, cancelled, or no_driver (no driver matched)",
        "service_type": "regular / premium / limo / charter, derived from fleet_brand",
        "wait_time_min": "Minutes from request to pickup (null when no_driver)",
        "request_ts": "Timestamp the ride was requested",
    },
    "fact_vehicle_health": {
        "anomaly_score": "Model-derived condition score in [0,1]; >=0.7 is actionable",
        "needs_service_flag": "1 if the vehicle needs maintenance now (ML target)",
        "brake_wear_pct": "Brake pad wear percentage",
        "battery_v": "Battery voltage (healthy ~12.6V)",
    },
    "dim_driver": {"nik": "Indonesian national ID number (PII)", "phone": "Driver phone (PII)",
                   "driver_name": "Driver full name (PII)"},
    "dim_customer": {"email": "Customer email (PII)", "phone": "Customer phone (PII)",
                     "customer_name": "Customer full name (PII)"},
}

for t, c in TABLE_COMMENTS.items():
    spark.sql(f"COMMENT ON TABLE {fq(t)} IS '{c.replace(chr(39), chr(39)+chr(39))}'")
for t, cols in COL_COMMENTS.items():
    for col, c in cols.items():
        spark.sql(f"ALTER TABLE {fq(t)} ALTER COLUMN {col} COMMENT '{c.replace(chr(39), chr(39)+chr(39))}'")
print("COMMENTS DONE")
