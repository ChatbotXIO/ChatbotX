import { spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Redis } from "ioredis"

const THROWAWAY_PREFIX = "chatbotx_it_"
const TEST_REDIS_DB = "5"
const REDIS_URL_ENV_KEYS = [
  "REDIS_URL",
  "REDIS_SEQUENCE_URL",
  "REDIS_CACHE_URL",
  "REDIS_QUEUE_URL",
  "REDIS_QUEUE_BULK_URL",
] as const

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))
const databasePackage = path.join(repoRoot, "packages", "database")

// Runs in `packages/database`, the only workspace that resolves `pg`.
const RUN_ADMIN_SQL = `
const { Client } = require("pg");
(async () => {
  const client = new Client({ connectionString: process.env.ADMIN_URL });
  await client.connect();
  await client.query(process.env.ADMIN_SQL);
  await client.end();
})().catch((error) => { console.error(error.message); process.exit(1); });
`

const runAdminSql = (adminUrl: string, sql: string): void => {
  const result = spawnSync(process.execPath, ["-e", RUN_ADMIN_SQL], {
    cwd: databasePackage,
    env: { ...process.env, ADMIN_URL: adminUrl, ADMIN_SQL: sql },
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new Error(`Admin SQL failed: ${result.stderr || result.stdout}`)
  }
}

const withDatabaseName = (url: string, name: string): string => {
  const parsed = new URL(url)
  parsed.pathname = `/${name}`
  return parsed.toString()
}

const TRAILING_REDIS_DB = /\/\d*$/

const withRedisDb = (url: string): string =>
  `${url.replace(TRAILING_REDIS_DB, "")}/${TEST_REDIS_DB}`

/**
 * Teardown flushes the whole Redis db, so refuse to start unless it is empty:
 * a db that already holds keys belongs to something else (or to a concurrent or
 * crashed run) and must not be wiped.
 */
const assertRedisDbIsEmpty = async (redisUrl: string): Promise<void> => {
  const probe = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
  })
  try {
    await probe.connect()
    const keys = await probe.dbsize()
    if (keys > 0) {
      throw new Error(
        `test:db needs an empty Redis db ${TEST_REDIS_DB} (found ${keys} keys): it flushes that db when the run ends. Empty it yourself if it is stale, or point REDIS_URL at a dedicated instance.`,
      )
    }
  } finally {
    probe.disconnect()
  }
}

/**
 * Creates `chatbotx_it_<random>` on the server `DATABASE_URL` points at (that
 * URL is only used to run CREATE/DROP DATABASE), applies every migration with
 * the repo's own runner, then points every worker at the new database and at
 * Redis db 5. `E2E_KEEP_DB=1` keeps the database after the run for inspection.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const serverUrl = process.env.DATABASE_URL
  if (!serverUrl || new URL(serverUrl).port === "1") {
    throw new Error(
      "test:db needs DATABASE_URL to point at a real Postgres server (it is only used to CREATE a throwaway database). Run it through `pnpm --filter worker test:db`.",
    )
  }

  const name = `${THROWAWAY_PREFIX}${Date.now()}_${randomBytes(3).toString("hex")}`
  const adminUrl = withDatabaseName(serverUrl, "postgres")
  const throwawayUrl = withDatabaseName(serverUrl, name)

  const redisUrl = withRedisDb(
    process.env.REDIS_URL ?? "redis://localhost:6379",
  )
  await assertRedisDbIsEmpty(redisUrl)

  runAdminSql(adminUrl, `CREATE DATABASE "${name}"`)

  const migrate = spawnSync(
    process.execPath,
    [path.join(databasePackage, "scripts", "run-migrations.mjs")],
    {
      cwd: databasePackage,
      env: { ...process.env, DATABASE_URL: throwawayUrl },
      encoding: "utf8",
    },
  )
  if (migrate.status !== 0) {
    runAdminSql(adminUrl, `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
    throw new Error(`Migrations failed: ${migrate.stderr || migrate.stdout}`)
  }

  process.env.DATABASE_URL = throwawayUrl
  process.env.E2E_THROWAWAY_DATABASE = name
  for (const key of REDIS_URL_ENV_KEYS) {
    process.env[key] = redisUrl
  }

  return async () => {
    const flush = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
    })
    try {
      await flush.connect()
      await flush.flushdb()
    } catch {
      // Redis may be gone already; the database is still dropped below.
    } finally {
      flush.disconnect()
    }

    if (process.env.E2E_KEEP_DB === "1") {
      console.info(`[test:db] kept throwaway database ${name}`)
      return
    }
    runAdminSql(adminUrl, `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
  }
}

export { THROWAWAY_PREFIX }
