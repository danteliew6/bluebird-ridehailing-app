"""Phase 2 — Unity Catalog governance for Bluebird ride-hailing.

 - PII classification tags (custom key `bb_pii`)
 - Column masks on PII (driver/customer) via allowlist-UDF bypass
 - City-scoped row filter on fact_trip
 - Schema grants for account users (Genie / dashboard / app SP read with policies enforced)

Pattern (per workspace constraints): masks/filters reference the UNGOVERNED
driver_access_allowlist so they don't trip the "nested governed reference" restriction,
and privilege is decided by current_user() against that allowlist.
"""
import os
import sys

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from bluebird_config import CATALOG, SCHEMA, S, get_spark, fq  # noqa: E402,F401

spark = get_spark()

stmts = [
    # ---------- privilege helper (reads ungoverned allowlist) ----------
    f"""CREATE OR REPLACE FUNCTION {S}.bb_is_privileged()
        RETURNS BOOLEAN
        COMMENT 'True for national/admin identities in the ungoverned access allowlist'
        RETURN current_user() IN (SELECT email FROM {fq('driver_access_allowlist')} WHERE is_admin = true)""",

    # ---------- mask functions ----------
    f"""CREATE OR REPLACE FUNCTION {S}.bb_mask_str(v STRING)
        RETURNS STRING
        COMMENT 'Partial mask: privileged sees clear, others see bullets + last 2 chars'
        RETURN CASE WHEN {S}.bb_is_privileged() THEN v
                    WHEN v IS NULL THEN NULL
                    ELSE concat('•••', right(v, 2)) END""",
    f"""CREATE OR REPLACE FUNCTION {S}.bb_mask_full(v STRING)
        RETURNS STRING
        COMMENT 'Full redaction for high-sensitivity PII (e.g. NIK)'
        RETURN CASE WHEN {S}.bb_is_privileged() THEN v ELSE 'REDACTED-PII' END""",

    # ---------- city-scoped row-filter function ----------
    f"""CREATE OR REPLACE FUNCTION {S}.bb_city_filter(trip_city STRING)
        RETURNS BOOLEAN
        COMMENT 'Row filter: privileged/national see all; city-ops see only their city'
        RETURN {S}.bb_is_privileged()
            OR EXISTS (SELECT 1 FROM {fq('driver_access_allowlist')} a
                       WHERE a.email = current_user()
                         AND (a.allowed_city = 'ALL' OR a.allowed_city = trip_city))""",

    # ---------- PII classification tags (custom key bb_pii) ----------
    f"ALTER TABLE {fq('dim_driver')} ALTER COLUMN driver_name SET TAGS ('bb_pii' = 'name')",
    f"ALTER TABLE {fq('dim_driver')} ALTER COLUMN phone SET TAGS ('bb_pii' = 'phone')",
    f"ALTER TABLE {fq('dim_driver')} ALTER COLUMN nik SET TAGS ('bb_pii' = 'national_id')",
    f"ALTER TABLE {fq('dim_customer')} ALTER COLUMN customer_name SET TAGS ('bb_pii' = 'name')",
    f"ALTER TABLE {fq('dim_customer')} ALTER COLUMN phone SET TAGS ('bb_pii' = 'phone')",
    f"ALTER TABLE {fq('dim_customer')} ALTER COLUMN email SET TAGS ('bb_pii' = 'email')",

    # ---------- apply column masks ----------
    f"ALTER TABLE {fq('dim_driver')} ALTER COLUMN driver_name SET MASK {S}.bb_mask_str",
    f"ALTER TABLE {fq('dim_driver')} ALTER COLUMN phone SET MASK {S}.bb_mask_str",
    f"ALTER TABLE {fq('dim_driver')} ALTER COLUMN nik SET MASK {S}.bb_mask_full",
    f"ALTER TABLE {fq('dim_customer')} ALTER COLUMN customer_name SET MASK {S}.bb_mask_str",
    f"ALTER TABLE {fq('dim_customer')} ALTER COLUMN phone SET MASK {S}.bb_mask_str",
    f"ALTER TABLE {fq('dim_customer')} ALTER COLUMN email SET MASK {S}.bb_mask_str",

    # ---------- apply row filter ----------
    f"ALTER TABLE {fq('fact_trip')} SET ROW FILTER {S}.bb_city_filter ON (city)",

    # ---------- grants (policies still enforced per identity) ----------
    f"GRANT USE CATALOG ON CATALOG {CATALOG} TO `account users`",
    f"GRANT USE SCHEMA ON SCHEMA {S} TO `account users`",
    f"GRANT SELECT ON SCHEMA {S} TO `account users`",
    f"GRANT EXECUTE ON SCHEMA {S} TO `account users`",
]

for i, s in enumerate(stmts, 1):
    label = " ".join(s.split())[:80]
    try:
        spark.sql(s)
        print(f"[{i:02d}] OK  {label}")
    except Exception as e:
        print(f"[{i:02d}] ERR {label}\n      -> {str(e).splitlines()[0][:160]}")

print("GOVERNANCE DONE")
