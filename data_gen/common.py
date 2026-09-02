"""Shared config + zone master for the Bluebird ride-hailing demo data generation.

Catalog / schema / profile / Spark bootstrap come from the repo-root ``bluebird_config``
module (env-driven), so the whole data-gen stage re-points at another workspace via
environment variables set by the DABs bootstrap job. Defaults reproduce the original build.
"""
import os
import sys

# Make the repo-root config importable whether this runs as `python3 data_gen/x.py`
# locally (sys.path[0] == data_gen/) or as a job task.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from bluebird_config import CATALOG, SCHEMA, PROFILE, get_spark, fq  # noqa: E402,F401

N_DRIVERS = 700           # 1:1 with vehicles
N_VEHICLES = 700
N_CUSTOMERS = 15_000
N_TRIPS = 90_000
HISTORY_DAYS = 90

# Fleet brand mix (Bluebird's real sub-brands)
FLEET_BRANDS = ["Bluebird", "Silver Bird", "Golden Bird", "Big Bird"]
FLEET_WEIGHTS = [0.66, 0.20, 0.08, 0.06]

# City mix — Jakarta dominant
CITIES = ["Jakarta", "Surabaya", "Bandung", "Denpasar", "Medan"]
CITY_WEIGHTS = [0.55, 0.15, 0.12, 0.10, 0.08]

# Plate region codes
CITY_PLATE = {"Jakarta": "B", "Surabaya": "L", "Bandung": "D", "Denpasar": "DK", "Medan": "BK"}
# City center coords (lat, lng)
CITY_CENTER = {
    "Jakarta": (-6.2000, 106.8167),
    "Surabaya": (-7.2575, 112.7521),
    "Bandung": (-6.9175, 107.6191),
    "Denpasar": (-8.6705, 115.2126),
    "Medan": (3.5952, 98.6722),
}

# (city, area_name, zone_type)
ZONES = [
    # Jakarta
    ("Jakarta", "Sudirman CBD", "cbd"),
    ("Jakarta", "Thamrin", "cbd"),
    ("Jakarta", "SCBD Senayan", "cbd"),
    ("Jakarta", "Kuningan", "cbd"),
    ("Jakarta", "Menteng", "residential"),
    ("Jakarta", "Kemang", "residential"),
    ("Jakarta", "Kelapa Gading", "residential"),
    ("Jakarta", "Pondok Indah", "residential"),
    ("Jakarta", "PIK Avenue", "residential"),
    ("Jakarta", "Soekarno-Hatta Airport", "airport"),
    ("Jakarta", "Grand Indonesia Mall", "mall"),
    ("Jakarta", "Central Park Mall", "mall"),
    ("Jakarta", "Gambir Station", "transport_hub"),
    ("Jakarta", "Blok M", "transport_hub"),
    # Surabaya
    ("Surabaya", "Tunjungan CBD", "cbd"),
    ("Surabaya", "Gubeng", "residential"),
    ("Surabaya", "Darmo", "residential"),
    ("Surabaya", "Juanda Airport", "airport"),
    ("Surabaya", "Tunjungan Plaza", "mall"),
    ("Surabaya", "Gubeng Station", "transport_hub"),
    # Bandung
    ("Bandung", "Dago CBD", "cbd"),
    ("Bandung", "Cihampelas", "residential"),
    ("Bandung", "Setiabudi", "residential"),
    ("Bandung", "Husein Airport", "airport"),
    ("Bandung", "Paris van Java", "mall"),
    ("Bandung", "Bandung Station", "transport_hub"),
    # Denpasar / Bali
    ("Denpasar", "Sanur", "residential"),
    ("Denpasar", "Kuta", "residential"),
    ("Denpasar", "Seminyak", "residential"),
    ("Denpasar", "Ubud", "residential"),
    ("Denpasar", "Ngurah Rai Airport", "airport"),
    ("Denpasar", "Beachwalk Mall", "mall"),
    # Medan
    ("Medan", "Kesawan CBD", "cbd"),
    ("Medan", "Medan Baru", "residential"),
    ("Medan", "Polonia", "residential"),
    ("Medan", "Kualanamu Airport", "airport"),
    ("Medan", "Sun Plaza", "mall"),
]
