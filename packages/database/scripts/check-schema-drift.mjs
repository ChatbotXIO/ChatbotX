/**
 * Fails when the TypeScript schema has drifted away from the migration
 * snapshot chain.
 *
 * `drizzle-kit generate` diffs `src/schema` against the newest `snapshot.json`
 * in the chain. A migration folder that ships `migration.sql` without its
 * `snapshot.json` therefore leaves the chain tip describing a schema that no
 * longer matches the code: the very next `make:migration` re-emits the already
 * applied DDL, and it fails against any database that ran it ("column already
 * exists"). `db:fix-chain` cannot catch this — it skips snapshot-less folders.
 *
 * The probe is the generator itself, so there are no false positives: when the
 * chain is in sync drizzle-kit writes nothing at all. Any folder it does write
 * is the drift, and is removed again before exiting so the check never mutates
 * the repository.
 *
 * Usage: node ./scripts/check-schema-drift.mjs
 * Exit codes: 0 = in sync | 1 = drift detected | 2 = script error
 */

import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRIZZLE_DIR = join(__dirname, "../drizzle")
const PROBE_NAME = "schema_drift_probe"

const listMigrationFolders = () =>
  new Set(
    readdirSync(DRIZZLE_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  )

const before = listMigrationFolders()

const result = spawnSync("drizzle-kit", ["generate", `--name=${PROBE_NAME}`], {
  cwd: join(__dirname, ".."),
  encoding: "utf8",
})

if (result.error) {
  console.error("[ERROR] Could not run drizzle-kit:", result.error.message)
  process.exit(2)
}

const created = [...listMigrationFolders()].filter(
  (folder) => !before.has(folder),
)

// Always clean up before reporting, so a failing check never leaves a stray
// migration behind for the next command to pick up and apply.
const drift = created.map((folder) => {
  const sqlPath = join(DRIZZLE_DIR, folder, "migration.sql")
  const sql = existsSync(sqlPath) ? readFileSync(sqlPath, "utf8").trim() : ""
  rmSync(join(DRIZZLE_DIR, folder), { recursive: true, force: true })
  return { folder, sql }
})

if (result.status !== 0) {
  console.error(result.stdout ?? "")
  console.error(result.stderr ?? "")
  console.error("[ERROR] drizzle-kit generate failed.")
  process.exit(2)
}

if (drift.length === 0) {
  console.log("Schema is in sync with the migration snapshot chain.")
  process.exit(0)
}

console.error(
  "Schema drift detected — the newest snapshot.json does not match src/schema.\n",
)
for (const { sql } of drift) {
  console.error("drizzle-kit would generate:\n")
  console.error(`${sql}\n`)
}
console.error(
  "This usually means a migration folder ships migration.sql without its\n" +
    "snapshot.json. Regenerate that snapshot with `pnpm make:migration <name>`\n" +
    "and move the produced snapshot.json into the folder that is missing it.",
)
process.exit(1)
