import { createHash } from "node:crypto"
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@clickhouse/client"
import { command, ping } from "../client"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const CREATE_DATABASE_REGEX = /^CREATE\s+DATABASE\b/i

type MigrationState = {
  version: 1
  applied: Record<
    string,
    {
      checksum: string
      appliedAt: string
    }
  >
}

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex")
}

function loadState(statePath: string): MigrationState {
  try {
    const raw = readFileSync(statePath, "utf-8")
    const parsed = JSON.parse(raw) as MigrationState
    if (parsed && parsed.version === 1 && typeof parsed.applied === "object") {
      return parsed
    }
  } catch {
    // ignore
  }

  return { version: 1, applied: {} }
}

function saveState(statePath: string, state: MigrationState) {
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8")
}

async function runMigrations() {
  console.log("Checking ClickHouse connection...")
  const isConnected = await ping()

  if (!isConnected) {
    console.error("Failed to connect to ClickHouse")
    process.exit(1)
  }

  console.log("Connected to ClickHouse successfully")

  const clickhouseUrl = process.env.CLICKHOUSE_URL
  const clickhouseUser = process.env.CLICKHOUSE_USER
  const clickhousePassword = process.env.CLICKHOUSE_PASSWORD
  const clickhouseDatabase = process.env.CLICKHOUSE_DB

  if (!(clickhouseUrl && clickhouseUser && clickhousePassword)) {
    console.error("Missing ClickHouse environment variables")
    process.exit(1)
  }

  if (!clickhouseDatabase) {
    console.error("Missing CLICKHOUSE_DB environment variable")
    process.exit(1)
  }

  const adminClickhouse = createClient({
    url: clickhouseUrl,
    username: clickhouseUser,
    password: clickhousePassword,
    database: "default",
  })

  const force = process.env.CLICKHOUSE_MIGRATIONS_FORCE === "1"

  const forceFilesEnv = process.env.CLICKHOUSE_MIGRATIONS_FORCE_FILES
  const forceFiles = new Set(
    (forceFilesEnv || "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  )

  const migrationsDir =
    process.env.CLICKHOUSE_MIGRATIONS_DIR || join(__dirname, "./clickhouse")

  if (!statSync(migrationsDir, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`Migrations directory not found: ${migrationsDir}`)
    process.exit(1)
  }

  const sqlFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b))

  if (sqlFiles.length === 0) {
    console.log(`No .sql migrations found in: ${migrationsDir}`)
    return
  }

  const statePath =
    process.env.CLICKHOUSE_MIGRATIONS_STATE_FILE ||
    join(migrationsDir, ".migrations.local.json")

  const state = loadState(statePath)

  for (const fileName of sqlFiles) {
    const sqlPath = join(migrationsDir, fileName)
    const sql = readFileSync(sqlPath, "utf-8")

    const checksum = sha256(sql)
    const applied = state.applied[fileName]

    const isForcedFile =
      forceFiles.has("*") || forceFiles.has(fileName) || forceFiles.has(sqlPath)

    if (applied && applied.checksum === checksum && !isForcedFile) {
      console.log(`Skipping already applied migration: ${fileName}`)
      continue
    }

    if (applied && applied.checksum !== checksum && !(force || isForcedFile)) {
      console.error(
        `Migration file changed after being applied: ${fileName}. ` +
          "Set CLICKHOUSE_MIGRATIONS_FORCE=1 to re-run.",
      )
      process.exit(1)
    }

    const statements = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    console.log(
      `Running ${statements.length} SQL statements from ${fileName}...`,
    )

    for (const statement of statements) {
      try {
        const isCreateDatabase = CREATE_DATABASE_REGEX.test(statement)
        if (isCreateDatabase) {
          await adminClickhouse.command({ query: statement })
        } else {
          await command(statement)
        }
        console.log(`✓ Executed: ${statement.substring(0, 50)}...`)
      } catch (error) {
        console.error(`✗ Failed: ${statement.substring(0, 50)}...`)
        console.error(error)
        console.error(`Stopping migrations due to failure in ${fileName}`)
        process.exit(1)
      }
    }

    state.applied[fileName] = {
      checksum,
      appliedAt: new Date().toISOString(),
    }

    saveState(statePath, state)
  }

  console.log("Migrations completed!")
}

runMigrations().catch(console.error)
