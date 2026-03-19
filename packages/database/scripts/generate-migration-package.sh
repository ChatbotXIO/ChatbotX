#!/usr/bin/env bash
# Generates a minimal package.json for the migration container by
# extracting only the Drizzle-related dependencies from the
# database package.json.
#
# Usage: ./scripts/generate-migration-package.sh

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/package.json"
dst="$root/migration-package.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required to run this script" >&2
  exit 1
fi

jq --arg name "${$(jq -r '.name' "$src")}-migration" \
   '{
      name: .name + "-migration",
      version: "0.1.0",
      private: true,
      type: "module",
      dependencies: ( .dependencies // {} | with_entries(select(.key | test("drizzle")) ) ),
      devDependencies: ( .devDependencies // {} | with_entries(select(.key | test("drizzle")) ) ),
      scripts: {
        introspect: "drizzle-kit introspect",
        "make:migration": "./scripts/make-migration.sh",
        "db:migrate": "drizzle-kit migrate",
        "db:studio": "drizzle-kit studio",
        "db:check": "drizzle-kit check"
      }
    }' "$src" > "$dst"

echo "created $dst"
