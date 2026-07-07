#!/usr/bin/env bash
set -euo pipefail

# Usage: pnpm dev:wipe
# Wipes ALL local dev data: the Postgres DB, MinIO bucket (.local/data/*),
# and the app's DATA_DIR (uploaded files, config, cache, logs). Requires
# typing "DELETE" to confirm — nothing is removed otherwise.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="apps/api-server/.env"
TARGETS=(".local/data/postgres" ".local/data/minio")

# Resolve DATA_DIR from apps/api-server/.env, same as the app does at runtime.
if [ -f "$ENV_FILE" ]; then
  DATA_DIR_RAW=$(grep -E '^DATA_DIR=' "$ENV_FILE" | head -1 | cut -d '=' -f2- || true)
  if [ -n "$DATA_DIR_RAW" ]; then
    if [[ "$DATA_DIR_RAW" = /* ]]; then
      RESOLVED_DATA_DIR="$DATA_DIR_RAW"
    else
      RESOLVED_DATA_DIR="$(cd "apps/api-server" && cd "$(dirname "$DATA_DIR_RAW")" 2>/dev/null && pwd)/$(basename "$DATA_DIR_RAW")"
    fi
    if [ -d "$RESOLVED_DATA_DIR" ]; then
      TARGETS+=("$RESOLVED_DATA_DIR")
    fi
  fi
fi

echo "⚠️  This will PERMANENTLY delete local dev data:"
echo ""
for t in "${TARGETS[@]}"; do
  if [ -e "$t" ]; then
    echo "  - $t"
  fi
done
echo ""
echo "This includes your local database (accounts, folders, file metadata,"
echo "wrapped encryption keys) and all uploaded file chunks. This cannot be undone."
echo ""
read -r -p 'Type "DELETE" to confirm: ' CONFIRM
if [ "$CONFIRM" != "DELETE" ]; then
  echo "Aborted. Nothing was deleted."
  exit 1
fi

echo ""
echo "🛑 Stopping local infra..."
pnpm infra:down || true

for t in "${TARGETS[@]}"; do
  if [ -e "$t" ]; then
    echo "🗑️  Removing $t"
    rm -rf "$t"
  fi
done

echo ""
echo "🚀 Starting fresh infra..."
pnpm infra:up

echo ""
echo "✅ Local dev environment wiped. Database and storage are now empty."
