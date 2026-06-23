/**
 * Run pending shard schema migrations on all non-isMain shards.
 *
 * Reads SQL files from src/sharding/migrations/, connects to every shard
 * registered in MessageShard (excluding isMain), and applies any version
 * newer than what is stored in each shard's _shard_meta table.
 *
 * Usage:
 *   pnpm --filter @chatbotx.io/database db:migrate-shards
 */
import { readdir, readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { db } from "../src/client"
import {
  type ShardMigration,
  ShardMigrationRunner,
} from "../src/sharding/message/shard-migration-runner"

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = resolve(__dirname, "../src/sharding/migrations")

async function loadMigrations(): Promise<ShardMigration[]> {
  let files: string[]
  try {
    files = await readdir(migrationsDir)
  } catch {
    console.error(`Migrations directory not found: ${migrationsDir}`)
    process.exit(1)
  }

  const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort()
  if (sqlFiles.length === 0) {
    return []
  }

  const migrations: ShardMigration[] = []
  for (const file of sqlFiles) {
    const stem = file.slice(0, -4)
    const underscoreIdx = stem.indexOf("_")
    if (underscoreIdx === -1) {
      console.warn(`Skipping malformed migration filename: ${file}`)
      continue
    }
    const version = stem.slice(0, underscoreIdx)
    const description = stem.slice(underscoreIdx + 1)
    const sql = await readFile(resolve(migrationsDir, file), "utf8")
    migrations.push({ version, description, sql })
  }
  return migrations
}

async function main(): Promise<void> {
  const migrations = await loadMigrations()

  if (migrations.length === 0) {
    console.log("No shard migrations found in", migrationsDir)
    return
  }

  console.log(
    `Loaded ${migrations.length} migration(s):`,
    migrations.map((m) => `${m.version}_${m.description}`).join(", "),
  )

  const runner = new ShardMigrationRunner(db)
  await runner.runPendingMigrations(migrations)

  console.log("\nAll shard migrations complete.")
}

main().catch((err) => {
  console.error("Shard migration failed:", err)
  process.exit(1)
})
