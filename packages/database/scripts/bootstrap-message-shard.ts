/**
 * Bootstraps a local message shard Docker service, waits for the shard tables,
 * and registers the shard in the main database.
 *
 * Usage:
 *   pnpm --filter @chatbotx.io/database db:bootstrap-message-shard -- --port 5434
 *
 * Optional flags:
 *   --init                  Register the main DB itself as an inactive archive shard
 *                           (run once before adding external shards so historical
 *                           messages remain queryable after sharding is enabled)
 *   --since <date>          Archive range start date used with --init (default 2026-01-01).
 *                           ISO 8601 date string, e.g. 2026-01-01 or 2026-01-01T00:00:00Z
 *   --port <number>         Host port to expose on the machine (default 5434)
 *   --host <hostname>       Host stored in MessageShard (default host.docker.internal)
 *   --database <name>       Shard database name (default chatbotx_shard_<port>)
 *   --user <name>           Postgres user (default chatbotx)
 *   --password <value>      Postgres password (default secretkey)
 *   --service-name <name>   Compose service name (default message-shard-<port>)
 *   --delete                Remove the shard service and matching MessageShard row
 *   --inactive              Register the shard as inactive
 *   --set-active            Activate the latest shard (or --port to specify); closes previous active range
 */
import { execFileSync } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createId } from "@chatbotx.io/utils"
import { Pool } from "pg"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "../../..")
const composeFile = resolve(repoRoot, "out/docker-compose.local.yml")
const shardInitSql =
  "../packages/database/src/sharding/scripts/init-message-shard.sql"

interface ParsedArgs {
  database: string
  delete: boolean
  host: string
  inactive: boolean
  password: string
  port: number
  readHost: string
  readPort: number
  serviceName: string
  shardKey: number | null
  user: string
}

interface ShardSpec {
  database: string
  host: string
  isActive: boolean
  name: string
  password: string
  port: number
  readHost: string
  readPort: number
  shardKey: number | null
  user: string
}

const DEFAULT_PORT = 5434
// const DEFAULT_HOST = "host.docker.internal"
const DEFAULT_HOST = "localhost"
const LEADING_SLASH_REGEX = /^\//
const SHARD_TABLE_WAIT_TIMEOUT_MS = 90_000
const SHARD_TABLE_WAIT_INTERVAL_MS = 2000

function usage(): never {
  console.error(
    [
      "Usage: pnpm --filter @chatbotx.io/database db:bootstrap-message-shard -- [options]",
      "",
      "Options:",
      "  --port <number>         Host port to expose (default 5434)",
      "  --host <hostname>       Host stored in MessageShard (default host.docker.internal)",
      "  --database <name>       Shard database name (default POSTGRES_DB from ../../.env)",
      "  --user <name>           Postgres user (default POSTGRES_USER from ../../.env)",
      "  --password <value>      Postgres password (default MESSAGE_SHARDS_PASSWORD from ../../.env)",
      "  --service-name <name>   Compose service name (default message-shard-<port>)",
      "  --delete                Remove the shard service and matching MessageShard row",
      "  --inactive              Register the shard as inactive",
      "  --set-active            Activate the latest shard (or use with --port to target a specific one)",
    ].join("\n"),
  )
  process.exit(1)
}

function parseArgs(argv: string[]): ParsedArgs {
  const defaultDatabaseUrl = getDatabaseUrlDefaults()
  const parsed: ParsedArgs = {
    database: defaultDatabaseUrl.database,
    delete: false,
    host: DEFAULT_HOST,
    inactive: false,
    password: getDefaultShardPassword(),
    port: DEFAULT_PORT,
    readHost: DEFAULT_HOST,
    readPort: DEFAULT_PORT,
    serviceName: "",
    shardKey: null,
    user: defaultDatabaseUrl.user,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg) {
      continue
    }
    if (arg === "--") {
      continue
    }

    const consumeValue = (): string => {
      const value = argv[index + 1]
      if (!value || value.startsWith("--")) {
        usage()
      }
      index += 1
      return value
    }

    if (arg === "--port") {
      parsed.port = parsePort(consumeValue())
      continue
    }
    if (arg.startsWith("--port=")) {
      parsed.port = parsePort(arg.slice("--port=".length))
      continue
    }
    if (arg === "--host") {
      parsed.host = consumeValue()
      parsed.readHost = parsed.host
      continue
    }
    if (arg.startsWith("--host=")) {
      parsed.host = arg.slice("--host=".length)
      parsed.readHost = parsed.host
      continue
    }
    if (arg === "--database") {
      parsed.database = consumeValue()
      continue
    }
    if (arg.startsWith("--database=")) {
      parsed.database = arg.slice("--database=".length)
      continue
    }
    if (arg === "--user") {
      parsed.user = consumeValue()
      continue
    }
    if (arg.startsWith("--user=")) {
      parsed.user = arg.slice("--user=".length)
      continue
    }
    if (arg === "--password") {
      parsed.password = consumeValue()
      continue
    }
    if (arg.startsWith("--password=")) {
      parsed.password = arg.slice("--password=".length)
      continue
    }
    if (arg === "--service-name") {
      parsed.serviceName = consumeValue()
      continue
    }
    if (arg.startsWith("--service-name=")) {
      parsed.serviceName = arg.slice("--service-name=".length)
      continue
    }
    if (arg === "--inactive") {
      parsed.inactive = true
      continue
    }
    if (arg === "--delete") {
      parsed.delete = true
      continue
    }
    if (arg === "--active") {
      parsed.inactive = false
      continue
    }
    usage()
  }

  if (!parsed.serviceName) {
    parsed.serviceName = `message-shard-${parsed.port}`
  }
  if (!parsed.readHost) {
    parsed.readHost = parsed.host
  }
  if (!parsed.readPort) {
    parsed.readPort = parsed.port
  }
  if (parsed.shardKey === null) {
    parsed.shardKey = parsed.port
  }

  return parsed
}

function getDefaultShardPassword(): string {
  const password = process.env.MESSAGE_SHARDS_PASSWORD
  if (!password) {
    throw new Error(
      "MESSAGE_SHARDS_PASSWORD is required in ../../.env or pass --password explicitly.",
    )
  }
  return password
}

function getDatabaseUrlDefaults(): { database: string; user: string } {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required in ../../.env or pass --user and --database explicitly.",
    )
  }

  const url = new URL(databaseUrl)
  const database = decodeURIComponent(
    url.pathname.replace(LEADING_SLASH_REGEX, ""),
  )
  const user = decodeURIComponent(url.username)

  if (!(database && user)) {
    throw new Error(
      "DATABASE_URL must include both a username and database name for shard bootstrapping.",
    )
  }

  return { database, user }
}

function parsePort(value: string): number {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    console.error(`Invalid port: ${value}`)
    usage()
  }
  return port
}

function getExpectedServiceName(port: number): string {
  return `message-shard-${port}`
}

function buildComposeYaml(spec: ShardSpec): string {
  return [
    `name: chatbotx-local-shard-${spec.port}`,
    "",
    "include:",
    "  - ../docker-compose.yml",
    "",
    "x-service-common: &service-common",
    "  platform: linux/amd64",
    "  restart: unless-stopped",
    "  env_file:",
    "    - ../.env",
    "  extra_hosts:",
    '    - "host.docker.internal:host-gateway"',
    "  networks:",
    "    - chatbotx-network",
    "",
    "services:",
    `  ${spec.name}:`,
    "    <<: *service-common",
    "    image: timescale/timescaledb:latest-pg17",
    "    ports:",
    `      - "${spec.port}:5432"`,
    "    volumes:",
    `      - ${spec.name}-data:/home/postgres/pgdata`,
    `      - ${shardInitSql}:/docker-entrypoint-initdb.d/001-init-message-shard.sql:ro`,
    '    command: ["postgres", "-c", "log_statement=none"]',
    "    environment:",
    `      - POSTGRES_DB=${spec.database}`,
    `      - POSTGRES_USER=${spec.user}`,
    `      - POSTGRES_PASSWORD=${spec.password}`,
    "    healthcheck:",
    '      test: ["CMD-SHELL", "pg_isready -d $${POSTGRES_DB} -U $${POSTGRES_USER}"]',
    "      interval: 10s",
    "      timeout: 5s",
    "      retries: 5",
    "      start_period: 20s",
    "",
    "volumes:",
    `  ${spec.name}-data:`,
    "",
  ].join("\n")
}

async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

function runComposeCommand(args: string[]): string {
  return execFileSync("docker", ["compose", "-f", composeFile, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  })
}

async function writeComposeFile(spec: ShardSpec): Promise<void> {
  await ensureDirectory(resolve(repoRoot, "out"))
  await writeFile(composeFile, buildComposeYaml(spec), "utf8")
}

async function deleteShard(spec: ShardSpec): Promise<void> {
  const expectedServiceName = getExpectedServiceName(spec.port)
  if (spec.name !== expectedServiceName) {
    throw new Error(
      `Delete mode only supports the derived service name ${expectedServiceName} for port ${spec.port}.`,
    )
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.")
  }

  const serviceName = expectedServiceName

  await writeComposeFile({ ...spec, name: serviceName })
  console.log(`Wrote ${composeFile}`)

  const psOutput = runComposeCommand(["ps", "-q", serviceName]).trim()
  if (psOutput.length > 0) {
    console.log(`Removing Docker service ${serviceName}...`)
    runComposeCommand(["rm", "-sf", serviceName])
  } else {
    console.log(
      `Docker service ${serviceName} is not running; skipping removal.`,
    )
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
  })

  try {
    await pool.query("BEGIN")

    const existing = await pool.query<{ id: string }>(
      `
        SELECT id
        FROM "MessageShard"
        WHERE name = $1
          AND host = $2
          AND port = $3
          AND database = $4
          AND user = $5
        ORDER BY "createdAt" DESC
        LIMIT 1
      `,
      [spec.name, spec.host, spec.port, spec.database, spec.user],
    )

    const row = existing.rows[0]
    if (!row?.id) {
      console.log(
        `No MessageShard row matched name=${spec.name} host=${spec.host} port=${spec.port} — nothing to delete.`,
      )
      await pool.query("ROLLBACK")
      return
    }

    await pool.query(`DELETE FROM "MessageShard" WHERE id = $1`, [row.id])
    await pool.query("COMMIT")

    console.log(
      `Deleted MessageShard id=${row.id} name=${spec.name} host=${spec.host} port=${spec.port}`,
    )
  } catch (error) {
    await pool.query("ROLLBACK")
    throw error
  } finally {
    await pool.end()
  }
}

async function waitForShardTables(spec: ShardSpec): Promise<void> {
  const start = Date.now()
  const pool = new Pool({
    connectionString: `postgresql://${encodeURIComponent(spec.user)}:${encodeURIComponent(spec.password)}@127.0.0.1:${spec.port}/${spec.database}`,
    max: 1,
    connectionTimeoutMillis: 5000,
  })

  try {
    while (Date.now() - start < SHARD_TABLE_WAIT_TIMEOUT_MS) {
      try {
        const result = await pool.query(
          `SELECT to_regclass('public."Message"') AS message_table, to_regclass('public."Attachment"') AS attachment_table`,
        )
        const row = result.rows[0] as
          | { attachment_table: string | null; message_table: string | null }
          | undefined
        if (row?.message_table && row?.attachment_table) {
          return
        }
      } catch {
        // Keep retrying until the container finishes initialization.
      }

      await new Promise((resolve) =>
        setTimeout(resolve, SHARD_TABLE_WAIT_INTERVAL_MS),
      )
    }
  } finally {
    await pool.end()
  }

  throw new Error(
    `Timed out waiting for shard tables Message and Attachment on ${spec.host}:${spec.port}`,
  )
}

async function getActiveMessageShardId(pool: Pool): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM "MessageShard"
      WHERE "isActive" = true
      ORDER BY "createdAt" DESC
      LIMIT 1
    `,
  )

  return result.rows[0]?.id ?? null
}

async function upsertMessageShard(spec: ShardSpec): Promise<string> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.")
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
  })

  try {
    await pool.query("BEGIN")

    const existing = await pool.query<{ id: string }>(
      `
        SELECT id
        FROM "MessageShard"
        WHERE host = $1
          AND port = $2
        ORDER BY "createdAt" DESC
        LIMIT 1
      `,
      [spec.host, spec.port],
    )

    const activeShardId = spec.isActive
      ? await getActiveMessageShardId(pool)
      : null

    let shardId: string
    if (existing.rows[0]?.id) {
      shardId = existing.rows[0].id
      const effectiveIsActive =
        spec.isActive && (!activeShardId || activeShardId === shardId)

      if (spec.isActive && !effectiveIsActive) {
        console.warn(
          `Another active MessageShard already exists (id=${activeShardId}); keeping host=${spec.host} port=${spec.port} inactive to avoid unique constraint violation.`,
        )
      }

      await pool.query(
        `
          UPDATE "MessageShard"
          SET name = $2,
              database = $3,
              "user" = $4,
              "credentialRef" = NULL,
              "sslMode" = 'disable',
              "isActive" = $5,
              "shardKey" = $6,
              "readHost" = $7,
              "readPort" = $8,
              "updatedAt" = NOW()
          WHERE id = $1
        `,
        [
          shardId,
          spec.name,
          spec.database,
          spec.user,
          effectiveIsActive,
          spec.shardKey,
          spec.readHost,
          spec.readPort,
        ],
      )
    } else {
      shardId = createId()
      const effectiveIsActive =
        spec.isActive && (!activeShardId || activeShardId === shardId)

      if (spec.isActive && !effectiveIsActive) {
        console.warn(
          `Another active MessageShard already exists (id=${activeShardId}); creating host=${spec.host} port=${spec.port} as inactive to avoid unique constraint violation.`,
        )
      }

      await pool.query(
        `
          INSERT INTO "MessageShard" (
            id,
            name,
            host,
            port,
            database,
            "user",
            "credentialRef",
            "sslMode",
            "isActive",
            "shardKey",
            "readHost",
            "readPort"
          ) VALUES ($1, $2, $3, $4, $5, $6, NULL, 'disable', $7, $8, $9, $10)
        `,
        [
          shardId,
          spec.name,
          spec.host,
          spec.port,
          spec.database,
          spec.user,
          effectiveIsActive,
          spec.shardKey,
          spec.readHost,
          spec.readPort,
        ],
      )
    }

    if (spec.isActive && (!activeShardId || activeShardId === shardId)) {
      const openRange = await pool.query<{ id: string }>(
        `
          SELECT id
          FROM "ShardTimeRange"
          WHERE "shardId" = $1 AND "endTime" IS NULL
          LIMIT 1
        `,
        [shardId],
      )

      if (!openRange.rows[0]?.id) {
        await pool.query(
          `
            INSERT INTO "ShardTimeRange" (id, "shardId", "startTime")
            VALUES ($1, $2, NOW())
          `,
          [createId(), shardId],
        )
      }
    }

    await pool.query("COMMIT")
    return shardId
  } catch (error) {
    await pool.query("ROLLBACK")
    throw error
  } finally {
    await pool.end()
  }
}

async function initMainDbShard(archiveStartTime: Date): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.")
  }

  const url = new URL(databaseUrl)
  const host = url.hostname
  const port = url.port ? Number(url.port) : 5432
  const database = decodeURIComponent(
    url.pathname.replace(LEADING_SLASH_REGEX, ""),
  )
  const user = decodeURIComponent(url.username)

  const pool = new Pool({ connectionString: databaseUrl, max: 1 })

  try {
    await pool.query("BEGIN")

    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM "MessageShard" WHERE host = $1 AND port = $2 ORDER BY "createdAt" DESC LIMIT 1`,
      [host, port],
    )

    // Active when no external shards exist yet; archive once external shards are registered.
    const externalCount = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "MessageShard" WHERE "isMain" IS NOT TRUE`,
    )
    const isActive = Number(externalCount.rows[0]?.count ?? 0) === 0

    let shardId: string
    if (existing.rows[0]?.id) {
      shardId = existing.rows[0].id
      await pool.query(
        `UPDATE "MessageShard" SET name = 'main', database = $2, "user" = $3, "isMain" = true, "isActive" = $4, "updatedAt" = NOW() WHERE id = $1`,
        [shardId, database, user, isActive],
      )
      console.log(
        `Updated existing MessageShard id=${shardId} (main DB, isActive=${isActive})`,
      )
    } else {
      shardId = createId()
      await pool.query(
        `
          INSERT INTO "MessageShard" (
            id, name, host, port, database, "user",
            "credentialRef", "sslMode", "isActive", "isMain", "shardKey", "readHost", "readPort"
          ) VALUES ($1, 'main', $2, $3, $4, $5, NULL, 'disable', $6, true, NULL, NULL, NULL)
        `,
        [shardId, host, port, database, user, isActive],
      )
      console.log(
        `Created MessageShard id=${shardId} name=main host=${host} port=${port} isActive=${isActive}`,
      )
    }

    // Skip if this shard already has a range covering archiveStartTime.
    const coveringRange = await pool.query<{ id: string }>(
      `SELECT id FROM "ShardTimeRange" WHERE "shardId" = $1 AND "startTime" <= $2 LIMIT 1`,
      [shardId, archiveStartTime],
    )

    if (coveringRange.rows[0]) {
      console.log(
        `ShardTimeRange already covers archive start for shard id=${shardId}, skipping`,
      )
    } else {
      // ShardTimeRange_no_overlap is a GLOBAL exclusion constraint across all shards.
      // [archiveStart, ∞) would conflict with any existing open range.
      // Find the earliest range start (across all shards) after archiveStartTime
      // and use it as endTime so our range is [archiveStart, nextStart) — no overlap.
      const nextRange = await pool.query<{ startTime: Date }>(
        `SELECT MIN("startTime") AS "startTime" FROM "ShardTimeRange" WHERE "startTime" > $1`,
        [archiveStartTime],
      )
      const endTime = nextRange.rows[0]?.startTime ?? null

      if (endTime) {
        await pool.query(
          `INSERT INTO "ShardTimeRange" (id, "shardId", "startTime", "endTime") VALUES ($1, $2, $3, $4)`,
          [createId(), shardId, archiveStartTime, endTime],
        )
        console.log(
          `Created ShardTimeRange ${archiveStartTime.toISOString()} → ${endTime.toISOString()}`,
        )
      } else {
        await pool.query(
          `INSERT INTO "ShardTimeRange" (id, "shardId", "startTime") VALUES ($1, $2, $3)`,
          [createId(), shardId, archiveStartTime],
        )
        console.log(
          `Created ShardTimeRange from ${archiveStartTime.toISOString()} (open) for shard id=${shardId}`,
        )
      }
    }

    await pool.query("COMMIT")
    if (isActive) {
      console.log(
        "\nMain DB registered as active shard (no external shards yet).",
        "\nIt will be demoted to archive (isActive=false) when external shards are added.",
      )
    } else {
      console.log(
        "\nMain DB registered as archive shard (isActive=false).",
        "\nHistorical messages will be included in reads via ShardTimeRange.",
      )
    }
  } catch (error) {
    await pool.query("ROLLBACK")
    throw error
  } finally {
    await pool.end()
  }
}

async function setActiveShard(port: number | null): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.")
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1 })

  try {
    await pool.query("BEGIN")

    // Resolve target shard
    let target:
      | { host: string; id: string; name: string; port: number }
      | undefined
    if (port === null) {
      const result = await pool.query<{
        host: string
        id: string
        name: string
        port: number
      }>(
        `SELECT id, name, host, port FROM "MessageShard" WHERE "isMain" IS NOT TRUE ORDER BY "createdAt" DESC LIMIT 1`,
      )
      target = result.rows[0]
      if (!target) {
        throw new Error(
          "No external MessageShard registered — run bootstrap first.",
        )
      }
    } else {
      const result = await pool.query<{
        host: string
        id: string
        name: string
        port: number
      }>(
        `SELECT id, name, host, port FROM "MessageShard" WHERE port = $1 AND ("isMain" IS NOT TRUE) ORDER BY "createdAt" DESC LIMIT 1`,
        [port],
      )
      target = result.rows[0]
      if (!target) {
        throw new Error(`No external MessageShard found for port ${port}`)
      }
    }

    // Close ANY currently open ShardTimeRange owned by another shard —
    // including the main-DB archive range created by --init. The exclusion
    // constraint ShardTimeRange_no_overlap allows only one open-ended range
    // table-wide, so the target's new open range would otherwise overlap.
    const closed = await pool.query<{ shardId: string }>(
      `UPDATE "ShardTimeRange" SET "endTime" = NOW() WHERE "endTime" IS NULL AND "shardId" <> $1 RETURNING "shardId"`,
      [target.id],
    )
    for (const row of closed.rows) {
      console.log(`Closed open ShardTimeRange for shard id=${row.shardId}`)
    }

    // Demote all shards (including isMain)
    await pool.query(
      `UPDATE "MessageShard" SET "isActive" = false, "updatedAt" = NOW() WHERE "isActive" = true`,
    )

    // Activate target
    await pool.query(
      `UPDATE "MessageShard" SET "isActive" = true, "updatedAt" = NOW() WHERE id = $1`,
      [target.id],
    )

    // Ensure target has an open ShardTimeRange
    const openRange = await pool.query<{ id: string }>(
      `SELECT id FROM "ShardTimeRange" WHERE "shardId" = $1 AND "endTime" IS NULL LIMIT 1`,
      [target.id],
    )
    if (!openRange.rows[0]) {
      await pool.query(
        `INSERT INTO "ShardTimeRange" (id, "shardId", "startTime") VALUES ($1, $2, NOW())`,
        [createId(), target.id],
      )
      console.log(`Created open ShardTimeRange for shard id=${target.id}`)
    }

    await pool.query("COMMIT")
    console.log(
      `\nActivated: id=${target.id} name=${target.name} host=${target.host} port=${target.port}`,
    )
  } catch (error) {
    await pool.query("ROLLBACK")
    throw error
  } finally {
    await pool.end()
  }
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2)

  if (rawArgs.includes("--init")) {
    const sinceIndex = rawArgs.indexOf("--since")
    const sinceValue =
      sinceIndex === -1 ? "2026-01-01T00:00:00.000Z" : rawArgs[sinceIndex + 1]
    const archiveStartTime = new Date(sinceValue ?? "2026-01-01T00:00:00.000Z")
    if (Number.isNaN(archiveStartTime.getTime())) {
      console.error(`Invalid --since value: ${sinceValue}`)
      process.exit(1)
    }
    await initMainDbShard(archiveStartTime)
    return
  }

  if (rawArgs.includes("--set-active")) {
    const portIndex = rawArgs.indexOf("--port")
    const portStr = portIndex === -1 ? null : rawArgs[portIndex + 1]
    const port = portStr ? parsePort(portStr) : null
    await setActiveShard(port)
    return
  }

  const args = parseArgs(rawArgs)
  const serviceName = args.serviceName || getExpectedServiceName(args.port)
  const spec: ShardSpec = {
    database: args.database,
    host: args.host,
    isActive: !args.inactive,
    name: serviceName,
    password: args.password,
    port: args.port,
    readHost: args.readHost,
    readPort: args.readPort,
    shardKey: args.shardKey,
    user: args.user,
  }

  const { password: _pw, ...safeSpec } = spec
  console.log({ spec: safeSpec })

  if (args.delete) {
    await deleteShard(spec)
    return
  }

  await writeComposeFile(spec)
  console.log(`Wrote ${composeFile}`)

  execFileSync(
    "docker",
    ["compose", "-f", composeFile, "up", "-d", spec.name],
    {
      stdio: "inherit",
    },
  )

  await waitForShardTables(spec)
  console.log(
    `Shard tables Message and Attachment are ready on ${spec.host}:${spec.port}`,
  )

  const shardId = await upsertMessageShard(spec)
  console.log(
    `Registered MessageShard id=${shardId} name=${spec.name} host=${spec.host} port=${spec.port}`,
  )
}

main().catch((error) => {
  console.error("Failed to bootstrap message shard:", error)
  process.exit(1)
})
