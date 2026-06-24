#!/bin/sh

set -e

if [ -z "$1" ]; then
  echo "Error: Migration name argument (\$1) is required."
  echo "Usage: pnpm make:sharding_migration <name>"
  exit 1
fi

TIMESTAMP=$(date -u +%Y%m%d%H%M%S)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS_DIR="${SCRIPT_DIR}/../src/sharding/migrations"
FILE="${MIGRATIONS_DIR}/${TIMESTAMP}_${1}.sql"

mkdir -p "${MIGRATIONS_DIR}"

printf -- "-- Shard migration: %s\n-- Version: %s\n\n" "$1" "$TIMESTAMP" > "${FILE}"

echo "Created: ${FILE}"
