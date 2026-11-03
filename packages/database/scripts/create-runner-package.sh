#!/usr/bin/env bash
set -euo pipefail

# Emit minimal package.json for Docker helpers (migrate or seed runner).
#
# Versions are read from the packages *installed* under
# <database-package-dir>/node_modules (i.e. what `pnpm install --frozen-lockfile`
# resolved from the lockfile), never from packages/database/package.json:
# that manifest uses pnpm-only specs (`catalog:`, `workspace:`) that the plain
# `npm install` run on this output cannot resolve.
#
# Usage:
#   ./scripts/create-runner-package.sh migrate <database-package-dir>
#   ./scripts/create-runner-package.sh seed <database-package-dir>

cmd="${1:-}"
pkgDir="${2:-}"

usage() {
  echo "usage: create-runner-package.sh <migrate|seed> <database-package-dir>" >&2
  exit 1
}

if [[ -z "$cmd" || -z "$pkgDir" ]]; then
  usage
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "create-runner-package.sh requires jq in PATH" >&2
  exit 1
fi

# Print the installed version of dependency $1, or exit non-zero.
installed_version() {
  local dep="$1"
  local manifest="$pkgDir/node_modules/$dep/package.json"
  local version

  if [[ ! -f "$manifest" ]]; then
    echo "$dep is not installed: $manifest not found (run pnpm install first)" >&2
    exit 1
  fi

  version="$(jq -r '.version // empty' "$manifest")"
  if [[ -z "$version" || "$version" == *:* ]]; then
    echo "$dep has no concrete version in $manifest (got '${version}')" >&2
    exit 1
  fi

  printf '%s' "$version"
}

case "$cmd" in
  migrate)
    drizzle="$(installed_version drizzle-orm)"
    pgver="$(installed_version pg)"
    jq -n --indent 2 \
      --arg name "@chatbotx.io/database-migrate-runner" \
      --arg drizzle "$drizzle" \
      --arg pg "$pgver" \
      '{name: $name, private: true, type: "module", dependencies: {"drizzle-orm": $drizzle, pg: $pg}}'
    ;;
  seed)
    pgver="$(installed_version pg)"
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
