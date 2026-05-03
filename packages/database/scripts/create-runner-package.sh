#!/usr/bin/env bash
set -euo pipefail

# Emit minimal package.json for Docker helpers (migrate or seed runner).
# Versions are taken from packages/database/package.json — update Drizzle there only.
#
# Usage:
#   ./scripts/create-runner-package.sh migrate <path-to-database-package.json>
#   ./scripts/create-runner-package.sh seed <path-to-database-package.json>

cmd="${1:-}"
pkgPath="${2:-}"

usage() {
  echo "usage: create-runner-package.sh <migrate|seed> <path-to-database-package.json>" >&2
  exit 1
}

if [[ -z "$cmd" || -z "$pkgPath" ]]; then
  usage
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "create-runner-package.sh requires jq in PATH" >&2
  exit 1
fi

if [[ ! -f "$pkgPath" ]]; then
  echo "file not found: $pkgPath" >&2
  exit 1
fi

drizzle="$(jq -r '.dependencies["drizzle-orm"] // empty' "$pkgPath")"
pgver="$(jq -r '.dependencies.pg // empty' "$pkgPath")"

if [[ -z "$drizzle" || -z "$pgver" ]]; then
  echo "packages/database/package.json must declare drizzle-orm and pg in dependencies" >&2
  exit 1
fi

case "$cmd" in
  migrate)
    jq -n --indent 2 \
      --arg name "@chatbotx.io/database-migrate-runner" \
      --arg drizzle "$drizzle" \
      --arg pg "$pgver" \
      '{name: $name, private: true, type: "module", dependencies: {"drizzle-orm": $drizzle, pg: $pg}}'
    ;;
  seed)
    jq -n --indent 2 \
      --arg name "@chatbotx.io/database-seed-runner" \
      --arg pg "$pgver" \
      '{name: $name, private: true, type: "module", dependencies: {pg: $pg}}'
    ;;
  *)
    echo "unknown command: $cmd (expected migrate or seed)" >&2
    exit 1
    ;;
esac
