#!/bin/sh
set -eu

# Standalone output has no pnpm workspace; use /migrate-runner and /seed-runner (see Dockerfile).

run_migrate() {
  echo "Running database migrations..."
  NODE_OPTIONS=--no-node-snapshot node /app/migrate-runner/scripts/run-migrations.mjs
}

run_seed() {
  echo "Running database seed..."
  SKIP_ENV_CHECK="${SKIP_ENV_CHECK:-true}" NODE_OPTIONS=--no-node-snapshot node /app/seed-runner/seed.cjs
}

start_server() {
  # Backward-compatible env gating (no command passed): migrate/seed, then serve.
  if [ "${RUN_DB_MIGRATE:-}" = "true" ]; then run_migrate; fi
  if [ "${RUN_DB_SEED:-}" = "true" ]; then run_seed; fi
  NODE_OPTIONS=--no-node-snapshot HOSTNAME="${HOSTNAME:-0.0.0.0}" PORT="${PORT:-3000}" \
    exec node apps/builder/server.js
}

case "${1:-}" in
  migrate)       run_migrate ;;            # one-shot, exits
  seed)          run_seed ;;               # one-shot, exits
  migrate-seed)  run_migrate; run_seed ;;  # one-shot, exits
  serve|"")      start_server ;;           # default: env-gated + server
  *)             exec "$@" ;;              # escape hatch (e.g. sh/debug)
esac
