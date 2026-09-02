#!/usr/bin/env bash
# ============================================================================
# Replicate the ENTIRE Bluebird solution into a workspace, one command.
# ----------------------------------------------------------------------------
# Orchestrates the DAB in the order the dependencies require:
#   0. render static assets for the target catalog.schema (app SQL + dashboard)
#   1. create the Lakebase project        (app's postgres binding needs it first)
#   2. bundle deploy                       (pipeline, jobs, app, dashboard + app SP)
#   3. run the bootstrap job               (data -> DQ -> governance -> metrics -> ML -> gold)
#   4. create Lakebase synced tables + grant the app SP
#   5. print the one remaining manual step (import the Genie space)
#
# Usage:
#   ./replicate.sh --profile <target-profile> [--target replica] \
#       [--catalog <c>] [--schema <s>] [--warehouse <id>]
#
# Everything is parameterized: --catalog/--schema/--warehouse override the
# target's bundle variables (and are exported so the shell steps match).
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")"

PROFILE=""
TARGET="replica"
CATALOG=""; SCHEMA=""; WAREHOUSE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)   PROFILE="$2"; shift 2 ;;
    --target)    TARGET="$2"; shift 2 ;;
    --catalog)   CATALOG="$2"; shift 2 ;;
    --schema)    SCHEMA="$2"; shift 2 ;;
    --warehouse) WAREHOUSE="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
[[ -z "$PROFILE" ]] && { echo "ERROR: --profile <target-profile> is required" >&2; exit 2; }

# Bundle --var overrides + matching env for the shell steps (setup_synced_tables.sh,
# render_assets.py) so every stage targets the same catalog/schema.
VARS=()
[[ -n "$CATALOG" ]]   && { VARS+=(--var "catalog=$CATALOG");       export BLUEBIRD_CATALOG="$CATALOG"; }
[[ -n "$SCHEMA" ]]    && { VARS+=(--var "schema=$SCHEMA");         export BLUEBIRD_SCHEMA="$SCHEMA"; }
[[ -n "$WAREHOUSE" ]] && { VARS+=(--var "warehouse_id=$WAREHOUSE"); export BLUEBIRD_WAREHOUSE_ID="$WAREHOUSE"; }
export BLUEBIRD_PROFILE="$PROFILE"

db()     { databricks --profile "$PROFILE" "$@"; }
bundle() { databricks bundle "$@" -t "$TARGET" --profile "$PROFILE" "${VARS[@]}"; }

echo "==> Replicating Bluebird into target='$TARGET' profile='$PROFILE'"
echo "    catalog=${CATALOG:-<target default>} schema=${SCHEMA:-<target default>}"

# 0. retarget static assets (no-op if catalog.schema == source)
python3 bootstrap/render_assets.py

# 1. Lakebase project (must exist before the app's postgres binding deploys)
./lakebase/setup_synced_tables.sh --profile "$PROFILE" --phase project

# 2. deploy all bundle resources
bundle validate
bundle deploy

# 3. reproduce the data journey
bundle run bluebird_bootstrap

# 4. Lakebase synced tables (gold now exists) + grant the app SP SELECT
./lakebase/setup_synced_tables.sh --profile "$PROFILE" --phase sync

# 5. done — the Genie space + app binding were created by 'bundle deploy'
cat <<EOF

============================================================================
Replication complete. The pipeline, jobs, app, dashboard, Genie space (bound to
the app), and Lakebase synced tables are all deployed.

The app URL is printed by 'bundle run' / 'databricks apps list --profile $PROFILE'.
============================================================================
EOF
