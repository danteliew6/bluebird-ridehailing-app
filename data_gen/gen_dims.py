"""Phase 1a — dimension tables + access allowlist for Bluebird ride-hailing demo."""
import random
from pyspark.sql import functions as F
from pyspark.sql.types import StringType
import pandas as pd
from common import (get_spark, fq, CATALOG, SCHEMA, ZONES, CITY_CENTER, CITY_PLATE,
                    N_DRIVERS, N_CUSTOMERS, FLEET_BRANDS, FLEET_WEIGHTS,
                    CITIES, CITY_WEIGHTS)

spark = get_spark()
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA} "
          f"COMMENT 'Bluebird ride-hailing demo — Indonesian taxi/ride-hailing ops, "
          f"governance + Genie + AI/BI + ML.'")

# ---------- pandas UDFs (self-contained Indonesian name pools; numpy only) ----------
_FIRST = ["Budi", "Siti", "Agus", "Dewi", "Andi", "Rina", "Joko", "Sri", "Bambang", "Ayu",
          "Putu", "Made", "Wayan", "Eka", "Rizki", "Dwi", "Fitri", "Yusuf", "Nurul", "Hendra",
          "Indah", "Rizal", "Lestari", "Adi", "Maya", "Fajar", "Ratna", "Teguh", "Wulan", "Iwan",
          "Dian", "Surya", "Nia", "Bayu", "Citra", "Gunawan", "Sari", "Hadi", "Tuti", "Reza"]
_LAST = ["Santoso", "Wijaya", "Susanto", "Hidayat", "Nugroho", "Saputra", "Kusuma", "Halim",
         "Pratama", "Wibowo", "Setiawan", "Gunawan", "Purnama", "Firdaus", "Maulana", "Utomo",
         "Permana", "Suryadi", "Anggraini", "Puspita", "Handoko", "Rahayu", "Siregar", "Simanjuntak",
         "Tanuwijaya", "Kurniawan", "Hartono", "Lesmana", "Yulianto", "Prabowo"]
@F.pandas_udf(StringType())
def fake_name(ids: pd.Series) -> pd.Series:
    import numpy as np
    rng = np.random.default_rng((int(ids.iloc[0]) if len(ids) else 0) + 7)
    fi = rng.integers(0, len(_FIRST), size=len(ids))
    li = rng.integers(0, len(_LAST), size=len(ids))
    return pd.Series([f"{_FIRST[a]} {_LAST[b]}" for a, b in zip(fi, li)])

@F.pandas_udf(StringType())
def fake_phone(ids: pd.Series) -> pd.Series:
    import numpy as np
    rng = np.random.default_rng(int(ids.iloc[0]) if len(ids) else 0)
    pref = ["811", "812", "813", "821", "822", "852", "853", "857", "878", "895"]
    out = []
    for _ in range(len(ids)):
        p = pref[rng.integers(0, len(pref))]
        out.append("+62" + p + "".join(str(d) for d in rng.integers(0, 10, size=7)))
    return pd.Series(out)

@F.pandas_udf(StringType())
def fake_nik(ids: pd.Series) -> pd.Series:
    import numpy as np
    rng = np.random.default_rng((int(ids.iloc[0]) if len(ids) else 0) + 999)
    return pd.Series(["".join(str(d) for d in rng.integers(0, 10, size=16)) for _ in range(len(ids))])

@F.pandas_udf(StringType())
def fake_email(names: pd.Series) -> pd.Series:
    import re
    out = []
    for i, n in enumerate(names):
        base = re.sub(r"[^a-z]", ".", str(n).lower()).strip(".")
        out.append(f"{base}{i%97}@gmail.com")
    return pd.Series(out)

# ---------- dim_zone ----------
zone_rows = []
for i, (city, area, ztype) in enumerate(ZONES):
    clat, clng = CITY_CENTER[city]
    random.seed(i)
    zone_rows.append((f"ZON-{i:04d}", city, area, ztype,
                      round(clat + random.uniform(-0.06, 0.06), 5),
                      round(clng + random.uniform(-0.06, 0.06), 5)))
zone_df = spark.createDataFrame(zone_rows, ["zone_id", "city", "area_name", "zone_type", "lat", "lng"])
zone_df.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(fq("dim_zone"))
print(f"dim_zone: {zone_df.count()} rows")

# ---------- dim_driver ----------
brand_case = F
_b = F.when(F.rand(1) < FLEET_WEIGHTS[0], FLEET_BRANDS[0]) \
      .when(F.rand(1) < FLEET_WEIGHTS[0] + FLEET_WEIGHTS[1], FLEET_BRANDS[1]) \
      .when(F.rand(1) < FLEET_WEIGHTS[0] + FLEET_WEIGHTS[1] + FLEET_WEIGHTS[2], FLEET_BRANDS[2]) \
      .otherwise(FLEET_BRANDS[3])
_city = F.when(F.rand(2) < CITY_WEIGHTS[0], CITIES[0]) \
         .when(F.rand(2) < sum(CITY_WEIGHTS[:2]), CITIES[1]) \
         .when(F.rand(2) < sum(CITY_WEIGHTS[:3]), CITIES[2]) \
         .when(F.rand(2) < sum(CITY_WEIGHTS[:4]), CITIES[3]) \
         .otherwise(CITIES[4])
drivers = (spark.range(0, N_DRIVERS, numPartitions=8)
    .withColumn("driver_id", F.concat(F.lit("DRV-"), F.lpad(F.col("id").cast("string"), 5, "0")))
    .withColumn("driver_name", fake_name(F.col("id")))
    .withColumn("phone", fake_phone(F.col("id")))
    .withColumn("nik", fake_nik(F.col("id")))
    .withColumn("fleet_brand", _b)
    .withColumn("home_city", _city)
    .withColumn("rating", F.round(F.least(F.lit(5.0), F.lit(3.6) + F.randn(3) * 0.35 + 0.9), 2))
    .withColumn("join_date", F.expr("date_sub(current_date(), cast(rand(4)*1825 as int))"))
    .withColumn("status", F.when(F.rand(5) < 0.88, "active").when(F.rand(5) < 0.96, "inactive").otherwise("suspended"))
    .withColumnRenamed("id", "driver_idx"))
drivers.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(fq("dim_driver"))
print(f"dim_driver: {drivers.count()} rows")

# ---------- dim_vehicle (1:1 with driver, matching fleet_brand) ----------
drv = spark.table(fq("dim_driver")).select("driver_idx", "fleet_brand", "home_city")

def make_vehicles(pdf_iter):
    import numpy as np, pandas as pd
    models = {
        "Bluebird": [("Toyota", "Limo"), ("Toyota", "Vios"), ("Toyota", "Avanza")],
        "Silver Bird": [("Mercedes-Benz", "E-Class"), ("Toyota", "Alphard"), ("Toyota", "Camry")],
        "Golden Bird": [("Toyota", "Alphard"), ("Toyota", "HiAce Premio"), ("Mercedes-Benz", "V-Class")],
        "Big Bird": [("Hino", "R260 Bus"), ("Mercedes-Benz", "OH1626 Bus"), ("Toyota", "HiAce")],
    }
    for pdf in pdf_iter:
        rng = np.random.default_rng(20240 + int(pdf["driver_idx"].iloc[0]))
        rows = []
        for _, r in pdf.iterrows():
            fb = r["fleet_brand"]
            brand, model = models[fb][rng.integers(0, len(models[fb]))]
            # premium/charter older
            if fb in ("Golden Bird", "Big Bird"):
                year = int(rng.integers(2013, 2021))
            elif fb == "Silver Bird":
                year = int(rng.integers(2016, 2023))
            else:
                year = int(rng.integers(2018, 2025))
            age = 2026 - year
            odo = int(max(5000, rng.normal(age * 42000, 15000)))
            plate = f"{CITY_PLATE[r['home_city']]} {rng.integers(1000,9999)} {chr(65+rng.integers(0,26))}{chr(65+rng.integers(0,26))}"
            in_service = f"{year}-{rng.integers(1,13):02d}-{rng.integers(1,28):02d}"
            last_service = int(rng.integers(2, 190))  # days ago
            rows.append((int(r["driver_idx"]), f"VEH-{int(r['driver_idx']):05d}", plate, brand,
                         model, year, fb, in_service, odo, last_service,
                         "active" if rng.random() < 0.94 else "in_shop"))
        yield pd.DataFrame(rows, columns=["vehicle_idx", "vehicle_id", "plate", "brand", "model",
                                          "year", "fleet_brand", "in_service_date", "odometer_km",
                                          "days_since_service", "status"])

veh_schema = ("vehicle_idx long, vehicle_id string, plate string, brand string, model string, "
              "year int, fleet_brand string, in_service_date string, odometer_km long, "
              "days_since_service int, status string")
vehicles = (drv.mapInPandas(make_vehicles, schema=veh_schema)
            .withColumn("in_service_date", F.to_date("in_service_date"))
            .withColumn("last_service_date", F.expr("date_sub(current_date(), days_since_service)"))
            .drop("days_since_service"))
vehicles.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(fq("dim_vehicle"))
print(f"dim_vehicle: {vehicles.count()} rows")

# ---------- dim_customer ----------
area_names = list({a for (_, a, _) in ZONES})
areas_lit = F.array(*[F.lit(a) for a in area_names])
customers = (spark.range(0, N_CUSTOMERS, numPartitions=16)
    .withColumn("customer_id", F.concat(F.lit("CUS-"), F.lpad(F.col("id").cast("string"), 6, "0")))
    .withColumn("customer_name", fake_name(F.col("id") + 100000))
    .withColumn("phone", fake_phone(F.col("id") + 100000))
    .withColumn("customer_name_dup", F.col("customer_name"))
    .withColumn("email", fake_email(F.col("customer_name_dup")))
    .drop("customer_name_dup")
    .withColumn("home_area", F.element_at(areas_lit, (F.floor(F.rand(7) * len(area_names)) + 1).cast("int")))
    .withColumn("member_tier", F.when(F.rand(8) < 0.70, "regular").when(F.rand(8) < 0.88, "silver")
                .when(F.rand(8) < 0.97, "gold").otherwise("platinum"))
    .withColumn("signup_date", F.expr("date_sub(current_date(), cast(rand(9)*1460 as int))"))
    .withColumnRenamed("id", "customer_idx"))
customers.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(fq("dim_customer"))
print(f"dim_customer: {customers.count()} rows")

# ---------- driver_access_allowlist (UNGOVERNED — powers mask/ABAC bypass) ----------
allow_rows = [
    ("dante.liew@databricks.com", "ALL", True),
    ("jakarta.ops@bluebird.co.id", "Jakarta", False),
    ("bali.ops@bluebird.co.id", "Denpasar", False),
    ("analyst.national@bluebird.co.id", "ALL", False),
]
allow_df = spark.createDataFrame(allow_rows, ["email", "allowed_city", "is_admin"])
allow_df.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(fq("driver_access_allowlist"))
print(f"driver_access_allowlist: {allow_df.count()} rows")

print("DIMS DONE")
