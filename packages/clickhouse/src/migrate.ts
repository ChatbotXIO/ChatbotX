import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@clickhouse/client"
import { ping } from "./client"
import { keys } from "./keys"

const __filename = fileURLToPath(import.meta.url)
const __dirname = join(dirname(__filename), "migrations")

const CREATE_DATABASE_REGEX = /^CREATE\s+DATABASE\b/i

/** Removes SQL block comments so semicolons inside them do not split statements. */
const stripBlockComments = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, "")

/** One statement per `;` after removing line and block comments (migrations are line-oriented). */
const parseSqlStatements = (sql: string): string[] => {
  const withoutLineComments = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")

  return stripBlockComments(withoutLineComments)
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

const truncateForLog = (text: string, maxLen = 80): string => {
  const singleLine = text.replace(/\s+/g, " ").trim()
  if (singleLine.length <= maxLen) {
    return singleLine
  }
  return `${singleLine.slice(0, maxLen)}…`
}

const runMigrations = async () => {
  console.log("Checking ClickHouse connection...")
  const isConnected = await ping()

  if (!isConnected) {
    console.error("Failed to connect to ClickHouse")
    process.exit(1)
  }

  console.log("Connected to ClickHouse successfully")

  const env = keys()

  const adminClickhouse = createClient({
    url: env.CLICKHOUSE_URL,
    username: env.CLICKHOUSE_USER,
    password: env.CLICKHOUSE_PASSWORD,
    database: "default",
    request_timeout: env.CLICKHOUSE_REQUEST_TIMEOUT,
  })

  const escapeSqlString = (value: string) => value.replace(/'/g, "''")
  const quoteIdentifier = (identifier: string) =>
    `\`${identifier.replace(/`/g, "``")}\``

  const ensureDatabasesExist = async (databaseNames: string[]) => {
    const uniqueNames = Array.from(new Set(databaseNames.map((s) => s.trim())))

    const escapedInList = uniqueNames
      .map((name) => `'${escapeSqlString(name)}'`)
      .join(",")

    const existingRows = await adminClickhouse
      .query({
        query: `SELECT name FROM system.databases WHERE name IN (${escapedInList})`,
        format: "JSONEachRow",
      })
      .then((resultSet) => resultSet.json<{ name: string }[]>())

    const existing = new Set(existingRows.map((r) => r.name))

    for (const dbName of uniqueNames) {
      if (existing.has(dbName)) {
        console.log(`Database exists: ${dbName}`)
        continue
      }

      console.log(`Creating database: ${dbName}`)
      await adminClickhouse.command({
        query: `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(dbName)}`,
      })
    }
  }

  const _force = process.env.CLICKHOUSE_MIGRATIONS_FORCE === "1"

  const forceFilesEnv = process.env.CLICKHOUSE_MIGRATIONS_FORCE_FILES
  const forceFiles = new Set(
    (forceFilesEnv || "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  )

  const migrationsDir = process.env.CLICKHOUSE_MIGRATIONS_DIR || __dirname

  if (!statSync(migrationsDir, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`Migrations directory not found: ${migrationsDir}`)
    process.exit(1)
  }

  const mainDbFromEnv =
    (
      process.env.CLICKHOUSE_DATABASE ||
      process.env.CLICKHOUSE_DATABSE ||
      env.CLICKHOUSE_DB
    )?.trim() || ""

  if (!mainDbFromEnv) {
    console.error(
      "Missing main ClickHouse database env var: expected CLICKHOUSE_DATABASE (or fallback CLICKHOUSE_DATABSE / CLICKHOUSE_DB).",
    )
    process.exit(1)
  }

  await ensureDatabasesExist(["_chatbotx", mainDbFromEnv])

  const migrationsTrackingDb = "_chatbotx"
  const migrationsTrackingTable = "_clickhouse_migrations"

  // Tracks applied migration files by filename.
  await adminClickhouse.command({
    query: `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(
      migrationsTrackingDb,
    )}.${quoteIdentifier(migrationsTrackingTable)} (
      name String,
      created_at DateTime
    )
    ENGINE = ReplacingMergeTree(created_at)
    ORDER BY name`,
  })

  const migrationsClickhouse = createClient({
    url: env.CLICKHOUSE_URL,
    username: env.CLICKHOUSE_USER,
    password: env.CLICKHOUSE_PASSWORD,
    database: mainDbFromEnv,
    request_timeout: env.CLICKHOUSE_REQUEST_TIMEOUT,
    compression: {
      request: true,
      response: true,
    },
    clickhouse_settings: {
      async_insert: 1,
      wait_for_async_insert: 0,
      async_insert_max_data_size: "10485760",
      async_insert_busy_timeout_ms: 5000,
    },
  })

  const isMigrationRecorded = async (fileName: string) => {
    const escapedName = escapeSqlString(fileName)
    const resultSet = await adminClickhouse.query({
      query: `SELECT 1 AS ok FROM ${quoteIdentifier(
        migrationsTrackingDb,
      )}.${quoteIdentifier(migrationsTrackingTable)} WHERE name = '${escapedName}' LIMIT 1`,
      format: "JSONEachRow",
    })

    const rows = await resultSet.json<{ ok: number }[]>()
    return rows.length > 0
  }

  const recordMigrationApplied = async (fileName: string) => {
    const escapedName = escapeSqlString(fileName)
    await adminClickhouse.command({
      query: `INSERT INTO ${quoteIdentifier(
        migrationsTrackingDb,
      )}.${quoteIdentifier(migrationsTrackingTable)} (name, created_at) VALUES ('${escapedName}', now())`,
    })
  }

  const sqlFiles = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".sql"))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b))

  if (sqlFiles.length === 0) {
    console.log(`No .sql migrations found in: ${migrationsDir}`)
    return
  }

  try {
    for (const fileName of sqlFiles) {
      const sqlPath = join(migrationsDir, fileName)
      const sql = readFileSync(sqlPath, "utf-8")

      const isForcedFile =
        forceFiles.has("*") ||
        forceFiles.has(fileName) ||
        forceFiles.has(sqlPath)

      const alreadyRecorded = await isMigrationRecorded(fileName)
      if (alreadyRecorded && !isForcedFile) {
        console.log(
          `Skipping already applied migration (record exists): ${fileName}`,
        )
        continue
      }

      const statements = parseSqlStatements(sql)

      console.log(
        `Running ${statements.length} SQL statement(s) from ${fileName}...`,
      )

      for (const statement of statements) {
        try {
          const isCreateDatabase = CREATE_DATABASE_REGEX.test(statement)
          if (isCreateDatabase) {
            await adminClickhouse.command({ query: statement })
          } else {
            await migrationsClickhouse.command({ query: statement })
          }
          console.log(`✓ ${truncateForLog(statement)}`)
        } catch (error) {
          console.error(`✗ ${truncateForLog(statement)}`)
          console.error(error)
          console.error(`Stopping migrations due to failure in ${fileName}`)
          throw error
        }
      }

      await recordMigrationApplied(fileName)
    }

    console.log("Migrations completed!")
  } finally {
    await adminClickhouse.close().catch(() => {
      // ignore close errors during shutdown
    })
    await migrationsClickhouse.close().catch(() => {
      // ignore close errors during shutdown
    })
  }
}

runMigrations().catch((error) => {
  console.error(error)
  process.exit(1)
})
