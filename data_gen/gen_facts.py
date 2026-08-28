"""Phase 1b — fact_trip (clean gold) + fact_vehicle_health.

Business story baked in:
 - Jakarta evening peak (17-20h) over the most-recent ~30 days suffers a DRIVER SHORTAGE:
   no_driver + cancellation rates spike and surge multiplier climbs -> lost revenue.
 - ~12% of vehicles (older Golden/Big Bird) are DEGRADING: anomaly_score trends past 0.7
   and needs_service -> predictive-maintenance ML target.
 - Demand has daily (AM/PM peaks) + weekly (weekend) + zone_type seasonality -> forecastable.
"""
from pyspark.sql import functions as F
from common import get_spark, fq, N_TRIPS, CITIES, CITY_WEIGHTS

spark = get_spark()

# ---- small dims collected to driver (tiny) ----
zrows = spark.table(fq("dim_zone")).select("zone_id", "city", "zone_type").collect()
ZONES_BY_CITY = {}
for r in zrows:
    ZONES_BY_CITY.setdefault(r["city"], []).append((r["zone_id"], r["zone_type"]))
CITY_LIST = list(CITY_WEIGHTS and CITIES)
CITY_W = list(CITY_WEIGHTS)

drows = spark.table(fq("dim_driver")).select("driver_idx", "fleet_brand").orderBy("driver_idx").collect()
DRIVER_FLEET = [r["fleet_brand"] for r in drows]
N_DRV = len(DRIVER_FLEET)

SERVICE_BY_FLEET = {"Bluebird": "regular", "Silver Bird": "premium",
                    "Golden Bird": "limo", "Big Bird": "charter"}
SVC_MULT = {"regular": 1.0, "premium": 1.6, "limo": 2.5, "charter": 3.2}

# ---------- fact_trip via mapInPandas ----------
def gen_trips(pdf_iter):
    import numpy as np, pandas as pd
    # hour-of-day demand weights (AM + PM peaks)
    hour_w = np.array([0.6,0.4,0.3,0.3,0.5,1.2,3.0,5.5,5.0,3.5,2.8,3.0,
                       3.2,2.8,2.6,3.0,4.0,5.8,5.5,4.5,3.2,2.4,1.6,1.0])
    hour_w = hour_w / hour_w.sum()
    today = pd.Timestamp.now().normalize()
    for pdf in pdf_iter:
        n = len(pdf)
        seed = int(pdf["id"].iloc[0])
        rng = np.random.default_rng(seed + 31)
        # city
        city_i = rng.choice(len(CITY_LIST), size=n, p=CITY_W)
        cities = [CITY_LIST[i] for i in city_i]
        # driver / vehicle (1:1 idx) / fleet
        drv_idx = rng.integers(0, N_DRV, size=n)
        fleets = [DRIVER_FLEET[i] for i in drv_idx]
        svc = [SERVICE_BY_FLEET[f] for f in fleets]
        # customer (skewed: 30% frequent riders from first 2000)
        cust_idx = np.where(rng.random(n) < 0.30,
                            rng.integers(0, 2000, size=n),
                            rng.integers(0, 15000, size=n))
        # time
        day_off = rng.integers(0, 90, size=n)
        hours = rng.choice(24, size=n, p=hour_w)
        mins = rng.integers(0, 60, size=n)
        # zones (same city pickup/dropoff; airport bias)
        pu_id, do_id, ztypes = [], [], []
        for i in range(n):
            zlist = ZONES_BY_CITY[cities[i]]
            a = zlist[rng.integers(0, len(zlist))]
            b = zlist[rng.integers(0, len(zlist))]
            pu_id.append(a[0]); do_id.append(b[0]); ztypes.append(a[1])
        # distance / duration
        base_dist = np.exp(rng.normal(1.4, 0.6, size=n))  # ~4km median
        airport_boost = np.array([2.4 if zt == "airport" else 1.0 for zt in ztypes])
        dist = np.clip(base_dist * airport_boost, 0.5, 60).round(2)
        # incident flag: Jakarta, PM peak (17-20h), most recent 30 days
        recent = day_off < 30
        pm_peak = (hours >= 17) & (hours <= 20)
        jkt = np.array([c == "Jakarta" for c in cities])
        incident = jkt & pm_peak & recent
        # status
        u = rng.random(n)
        base_cancel, base_nodrv = 0.09, 0.05
        cancel_p = np.where(incident, 0.16, base_cancel)
        nodrv_p = np.where(incident, 0.22, base_nodrv)
        status = np.where(u < nodrv_p, "no_driver",
                  np.where(u < nodrv_p + cancel_p, "cancelled", "completed"))
        # surge: peaks + incident
        peak = ((hours >= 6) & (hours <= 9)) | pm_peak
        surge = np.ones(n)
        surge += np.where(peak, rng.uniform(0.1, 0.6, size=n), rng.uniform(0.0, 0.15, size=n))
        surge = np.where(incident, surge + rng.uniform(0.5, 1.1, size=n), surge)
        surge = surge.round(2)
        # speed by city/peak -> duration
        speed = np.where(jkt, 17.0, 24.0)
        speed = np.where(peak, speed * 0.7, speed)
        duration = (dist / speed * 60 * rng.uniform(0.9, 1.3, size=n)).round(1)
        # wait time
        wait = np.clip(rng.normal(np.where(incident, 12, 4), 2.5, size=n), 0.5, 40).round(1)
        # fare
        svc_mult = np.array([SVC_MULT[s] for s in svc])
        fare = ((15000 + 4200 * dist) * surge * svc_mult)
        fare = (np.round(fare / 500) * 500).astype("int64")
        # payment
        pay = rng.choice(["ewallet", "card", "cash", "corporate"], size=n, p=[0.45, 0.25, 0.22, 0.08])
        # rating (completed only)
        rating = np.clip(rng.normal(4.7, 0.4, size=n), 1.0, 5.0).round(1)

        req = today - pd.to_timedelta(day_off, unit="D") \
              + pd.to_timedelta(hours, unit="h") + pd.to_timedelta(mins, unit="m")
        completed = status == "completed"
        pickup = req + pd.to_timedelta(wait, unit="m")
        dropoff = pickup + pd.to_timedelta(np.where(completed, duration, 0), unit="m")

        df = pd.DataFrame({
            "trip_id": [f"TRP-{seed + i:08d}" for i in range(n)],
            "driver_idx": drv_idx.astype("int64"),
            "vehicle_idx": drv_idx.astype("int64"),
            "customer_idx": cust_idx.astype("int64"),
            "driver_id": [f"DRV-{i:05d}" for i in drv_idx],
            "vehicle_id": [f"VEH-{i:05d}" for i in drv_idx],
            "customer_id": [f"CUS-{i:06d}" for i in cust_idx],
            "pickup_zone_id": pu_id,
            "dropoff_zone_id": [do_id[i] if completed[i] else pu_id[i] for i in range(n)],
            "city": cities,
            "fleet_brand": fleets,
            "service_type": svc,
            "request_ts": req,
            "pickup_ts": pd.Series(np.where(status == "no_driver", pd.NaT, pickup.values)),
            "dropoff_ts": pd.Series(np.where(completed, dropoff.values, pd.NaT)),
            "distance_km": np.where(completed, dist, 0.0),
            "duration_min": np.where(completed, duration, 0.0),
            "fare_idr": np.where(completed, fare, 0).astype("int64"),
            "surge_multiplier": surge,
            "payment_method": pay,
            "rating": np.where(completed, rating, np.nan),
            "wait_time_min": np.where(status == "no_driver", np.nan, wait),
            "status": status,
        })
        df["request_ts"] = pd.to_datetime(df["request_ts"])
        df["pickup_ts"] = pd.to_datetime(df["pickup_ts"])
        df["dropoff_ts"] = pd.to_datetime(df["dropoff_ts"])
        yield df

trip_schema = (
    "trip_id string, driver_idx long, vehicle_idx long, customer_idx long, "
    "driver_id string, vehicle_id string, customer_id string, "
    "pickup_zone_id string, dropoff_zone_id string, city string, fleet_brand string, "
    "service_type string, request_ts timestamp, pickup_ts timestamp, dropoff_ts timestamp, "
    "distance_km double, duration_min double, fare_idr long, surge_multiplier double, "
    "payment_method string, rating double, wait_time_min double, status string")

trips = spark.range(0, N_TRIPS, numPartitions=16).mapInPandas(gen_trips, schema=trip_schema)
trips.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(fq("fact_trip"))
n_trips = spark.table(fq("fact_trip")).count()
print(f"fact_trip: {n_trips} rows")

# ---------- fact_vehicle_health via mapInPandas over dim_vehicle ----------
veh = spark.table(fq("dim_vehicle")).select("vehicle_idx", "vehicle_id", "year",
                                            "odometer_km", "fleet_brand")

def gen_health(pdf_iter):
    import numpy as np, pandas as pd
    today = pd.Timestamp.now().normalize()
    for pdf in pdf_iter:
        out = []
        rng = np.random.default_rng(500 + int(pdf["vehicle_idx"].iloc[0]))
        for _, v in pdf.iterrows():
            age = 2026 - int(v["year"])
            old = v["fleet_brand"] in ("Golden Bird", "Big Bird")
            degrading = (rng.random() < (0.28 if old else 0.06))
            base_anom = min(0.55, 0.04 * age + rng.uniform(0, 0.08))
            for d in range(90):
                day = today - pd.Timedelta(days=(89 - d))
                trend = (d / 90.0) * (0.55 if degrading else 0.06)
                anom = float(np.clip(base_anom + trend + rng.normal(0, 0.03), 0, 1))
                brake = float(np.clip(20 + age * 6 + (trend * 60) + rng.normal(0, 4), 0, 100))
                batt = float(np.clip(12.6 - (0.4 if degrading else 0.05) * (d / 90.0) * 3 + rng.normal(0, 0.1), 10.5, 12.9))
                temp = float(np.clip(88 + (trend * 25) + rng.normal(0, 3), 80, 125))
                km_since = int(max(0, rng.normal(6000 * (d % 30) / 30 + age * 500, 800)))
                dtc = int(rng.poisson(2.2 if anom > 0.6 else 0.2))
                needs = int(anom >= 0.7 or brake >= 85 or batt <= 11.2)
                out.append((v["vehicle_id"], int(v["vehicle_idx"]), day, round(temp, 1),
                            round(brake, 1), round(batt, 2), km_since, dtc,
                            round(anom, 3), needs, v["fleet_brand"]))
        yield pd.DataFrame(out, columns=["vehicle_id", "vehicle_idx", "reading_date", "engine_temp_c",
                                         "brake_wear_pct", "battery_v", "km_since_service", "dtc_count",
                                         "anomaly_score", "needs_service_flag", "fleet_brand"])

health_schema = ("vehicle_id string, vehicle_idx long, reading_date timestamp, engine_temp_c double, "
                 "brake_wear_pct double, battery_v double, km_since_service long, dtc_count int, "
                 "anomaly_score double, needs_service_flag int, fleet_brand string")
health = veh.repartition(8).mapInPandas(gen_health, schema=health_schema)
health.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(fq("fact_vehicle_health"))
print(f"fact_vehicle_health: {spark.table(fq('fact_vehicle_health')).count()} rows")
print("FACTS DONE")
