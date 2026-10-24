/**
 * Backfill owner and tenant attribution for retained WorkspaceMac billing rows.
 *
 * Rows are processed in small, id-keyed transactions. The old workspace FK means
 * every pre-migration row still has a live Workspace to supply its ownership.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node ./scripts/backfill-workspace-mac-owner.mjs
 *   DATABASE_URL=... DRY_RUN=1 node ./scripts/backfill-workspace-mac-owner.mjs
 *   DATABASE_URL=... BATCH_SIZE=1000 node ./scripts/backfill-workspace-mac-owner.mjs
 */
import { pathToFileURL } from "node:url"
import { Pool } from "pg"

const LOCK_TIMEOUT_MS = 5000
const DEFAULT_BATCH_SIZE = 1000
const PAUSE_BETWEEN_BATCHES_MS = 50

const FILLABLE_PREDICATE = '"ownerId" IS NULL OR "tenantId" IS NULL'

export const COUNT_SQL = `
  SELECT count(*)::bigint AS remaining
  FROM "WorkspaceMac"
  WHERE ${FILLABLE_PREDICATE}
`

export const BATCH_SQL = `
  WITH batch AS (
    SELECT "id"
    FROM "WorkspaceMac"
    WHERE ${FILLABLE_PREDICATE}
      AND "id" > $1::bigint
    ORDER BY "id"
    LIMIT $2
  )
  UPDATE "WorkspaceMac" AS target
  SET
    "ownerId" = COALESCE(target."ownerId", workspace."ownerId"),
    "tenantId" = COALESCE(target."tenantId", workspace."tenantId")
  FROM batch, "Workspace" AS workspace
  WHERE target."id" = batch."id"
    AND workspace."id" = target."workspaceId"
  RETURNING target."id"
`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** @returns {Promise<{ remaining: number, updated: number }>} */
export async function backfillWorkspaceMacOwner(
  pool,
  { batchSize = DEFAULT_BATCH_SIZE, dryRun = false } = {},
) {
  if (dryRun) {
    const { rows } = await pool.query(COUNT_SQL)
    return { remaining: Number(rows[0].remaining), updated: 0 }
  }

  let updated = 0
  let lastId = "0"
  for (;;) {
    const client = await pool.connect()
    let ids
    try {
      await client.query("BEGIN")
      await client.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT_MS}ms'`)
      const result = await client.query(BATCH_SQL, [lastId, batchSize])
      await client.query("COMMIT")
      ids = result.rows.map((row) => BigInt(row.id))
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined)
      throw error
    } finally {
      client.release()
    }

    if (ids.length === 0) {
      break
    }

    updated += ids.length
    lastId = ids.reduce((max, id) => (id > max ? id : max), 0n).toString()
    await sleep(PAUSE_BETWEEN_BATCHES_MS)
  }

  const { rows } = await pool.query(COUNT_SQL)
  return { remaining: Number(rows[0].remaining), updated }
}

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false

if (isMain) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("DATABASE_URL is required.")
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl })
  try {
    const result = await backfillWorkspaceMacOwner(pool, {
      batchSize: Number(process.env.BATCH_SIZE) || DEFAULT_BATCH_SIZE,
      dryRun: Boolean(process.env.DRY_RUN),
    })
    console.log(JSON.stringify(result))
  } finally {
    await pool.end()
  }
}
