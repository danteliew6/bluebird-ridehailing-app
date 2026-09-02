"""Retarget the static assets that embed a fully-qualified catalog.schema.

DABs substitutes ${var.*} inside YAML resource files, but NOT inside the app's
runtime SQL (config/queries/*.sql) or the serialized dashboard JSON. Those carry
the source workspace's `catalog.schema`. When replicating into a DIFFERENT
catalog/schema, run this once before `bundle deploy` to rewrite them in place.

Idempotent and a no-op on the source workspace (origin == target). Reads the
target from BLUEBIRD_CATALOG / BLUEBIRD_SCHEMA (defaults reproduce the source).

    python3 bootstrap/render_assets.py            # uses env, else source defaults
    BLUEBIRD_CATALOG=main BLUEBIRD_SCHEMA=bb python3 bootstrap/render_assets.py

Committed files keep the source default, so the source target always deploys
as-is; only pass different env when targeting another catalog. After a replica
deploy you can `git checkout -- config/queries dashboard` to restore defaults.
"""
import glob
import os

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGIN = "dante_classic_stable_catalog.bluebird_ride_hailing"

CATALOG = os.environ.get("BLUEBIRD_CATALOG", "dante_classic_stable_catalog")
SCHEMA = os.environ.get("BLUEBIRD_SCHEMA", "bluebird_ride_hailing")
TARGET = f"{CATALOG}.{SCHEMA}"

TARGETS = [
    os.path.join(_REPO_ROOT, "config", "queries", "*.sql"),
    os.path.join(_REPO_ROOT, "dashboard", "*.json"),
]


def main():
    if TARGET == ORIGIN:
        print(f"[render] target == origin ({ORIGIN}); nothing to do.")
        return
    changed = 0
    for pattern in TARGETS:
        for path in glob.glob(pattern):
            with open(path) as f:
                text = f.read()
            if ORIGIN in text:
                with open(path, "w") as f:
                    f.write(text.replace(ORIGIN, TARGET))
                changed += 1
                print(f"[render] {os.path.relpath(path, _REPO_ROOT)}: {ORIGIN} -> {TARGET}")
    print(f"[render] retargeted {changed} file(s) to {TARGET}")


if __name__ == "__main__":
    main()
