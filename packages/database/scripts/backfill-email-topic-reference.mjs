/**
 * Backfill `AnalyticsEmailTopic.topicReferenceId` for recipient rows created
 * before the snapshot column existed.
 *
 * The snapshot keeps an email's original topic after the topic is deleted
 * (`topicId` is then NULL). A row created earlier has `topicReferenceId` NULL
 * while its topic is still alive; copying `topicId` now is what lets a later
 * topic deletion keep recording that recipient's opens/clicks under the
 * original topic. Until then the writers fall back to `topicId`, so nothing
 * breaks if this never runs: it only closes the deleted-topic gap.
 *
 * Optional and manual: the migration never runs this (it would rewrite the
 * whole table under a lock). Works in small keyset batches, one short
 * transaction each, idempotent and resumable — a row already filled, or whose
 * topic is already gone (nothing to copy), is never touched.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node ./scripts/backfill-email-topic-reference.mjs
 *   DATABASE_URL=... DRY_RUN=1 node ./scripts/backfill-email-topic-reference.mjs
 *   DATABASE_URL=... WORKSPACE_ID=123 BATCH_SIZE=2000 node ./scripts/backfill-email-topic-reference.mjs
 */
import { pathToFileURL } from "node:url"
import { Pool } from "pg"

const LOCK_TIMEOUT_MS = 5000
const DEFAULT_BATCH_SIZE = 2000
const PAUSE_BETWEEN_BATCHES_MS = 50

/** Rows that can be filled. `$1` scopes a workspace (NULL = all). */
const FILLABLE_PREDICATE = `
  "topicReferenceId" IS NULL
  AND "topicId" IS NOT NULL
  AND ($1::bigint IS NULL OR "workspaceId" = $1::bigint)
`

export const COUNT_SQL = `
  SELECT count(*)::bigint AS remaining
  FROM "AnalyticsEmailTopic"
  WHERE ${FILLABLE_PREDICATE}
`

/** `$2` is the last id of the previous batch, `$3` the batch size. */
export const BATCH_SQL = `
  WITH batch AS (
    SELECT "id"
    FROM "AnalyticsEmailTopic"
    WHERE ${FILLABLE_PREDICATE}
      AND "id" > $2::bigint
    ORDER BY "id"
    LIMIT $3
  )
  UPDATE "AnalyticsEmailTopic" AS target
  SET "topicReferenceId" = target."topicId"
  FROM batch
  WHERE target."id" = batch."id"
  RETURNING target."id"
`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** @returns {Promise<{ remaining: number, updated: number }>} */
export async function backfillEmailTopicReference(
  pool,
  { batchSize = DEFAULT_BATCH_SIZE, dryRun = false, workspaceId = null } = {},
) {
  if (dryRun) {
    const { rows } = await pool.query(COUNT_SQL, [workspaceId])
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
      const result = await client.query(BATCH_SQL, [
        workspaceId,
        lastId,
        batchSize,
      ])
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

  const { rows } = await pool.query(COUNT_SQL, [workspaceId])
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
    const result = await backfillEmailTopicReference(pool, {
      batchSize: Number(process.env.BATCH_SIZE) || DEFAULT_BATCH_SIZE,
      dryRun: Boolean(process.env.DRY_RUN),
      workspaceId: process.env.WORKSPACE_ID || null,
    })
    console.log(JSON.stringify(result))
  } finally {
    await pool.end()
  }
}
