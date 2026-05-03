#!/bin/sh
set -eu

# Standalone output has no pnpm workspace; use /migrate-runner and /seed-runner (see Dockerfile).
if [ "${RUN_DB_MIGRATE:-}" = "true" ]; then
  echo "Running database migrations..."
  NODE_OPTIONS=--no-node-snapshot node /app/migrate-runner/scripts/run-migrations.mjs
fi

if [ "${RUN_DB_SEED:-}" = "true" ]; then
  echo "Running database seed..."
  SKIP_ENV_CHECK="${SKIP_ENV_CHECK:-true}" NODE_OPTIONS=--no-node-snapshot node /app/seed-runner/seed.mjs
fi

NODE_OPTIONS=--no-node-snapshot HOSTNAME="${HOSTNAME:-0.0.0.0}" PORT="${PORT:-3000}" exec node apps/builder/server.js
