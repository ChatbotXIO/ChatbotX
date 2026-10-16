/**
 * Backfill `inboxId` and `language` on historical `contact_created` analytics
 * events so the dashboard's Inbox filter and "New contacts by language"
 * chart also cover contacts created before those columns existed.
 *
 * Only `contact_created` rows are derivable: their `contactId` is the creating
 * ContactInbox id, so the inbox and language come from an exact join. Every
 * other event type (deleted, blocked, messages, conversations) and every
 * contact whose ContactInbox is gone stays NULL — nothing is guessed.
 *
 * Optional and manual: the migration never runs this. Run it only after the
 * `add_inbox_to_analytics_events` migration is applied.
 *
 * Works hypertable chunk by chunk, oldest first, one transaction per chunk
 * with a short `lock_timeout`. A compressed chunk is decompressed, updated and
 * compressed again (a failed re-compress is reported and left to the
 * compression policy). Idempotent and resumable: rows already filled, and
 * rows with nothing to fill from, are never rewritten.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node ./scripts/backfill-contact-event-attributes.mjs
 *   DATABASE_URL=... DRY_RUN=1 node ./scripts/backfill-contact-event-attributes.mjs
 *   DATABASE_URL=... WORKSPACE_ID=123 node ./scripts/backfill-contact-event-attributes.mjs
 */
import { pathToFileURL } from "node:url"
import { Pool } from "pg"

const LOCK_TIMEOUT_MS = 5000

/**
 * The languages the live emitters record (`supportedContactLanguages` in
 * `@chatbotx.io/business/contact-locale`, which cannot be imported from a plain
 * script). A test in the business package pins this list to the real one.
 */
export const SUPPORTED_LANGUAGES = [
  "en",
  "vi",
  "th",
  "id",
  "ms",
  "km",
  "lo",
  "my",
  "fil",
  "ja",
  "ko",
  "zh",
  "fr",
  "de",
  "es",
  "it",
  "pt",
  "nl",
  "ru",
  "ar",
  "hi",
]

/**
 * Same rule as `normalizeLanguage`: the base language of a stored locale
 * (`en_US` / `en-us` -> `en`), kept only when it is a supported language.
 */
const BASE_LANGUAGE_SQL = `lower(split_part(replace(trim(ci."language"), '-', '_'), '_', 1))`

/** Chunks of the contact-event hypertable, oldest first. */
export const LIST_CHUNKS_SQL = `
  SELECT chunk_schema, chunk_name, range_start, range_end, is_compressed
  FROM timescaledb_information.chunks
  WHERE hypertable_name = 'AnalyticsContactEvent'
  ORDER BY range_start ASC
`

/**
 * Rows of one chunk window that can be filled. `$1`/`$2` bound the window (so
 * the planner touches only that chunk), `$3` optionally scopes a workspace.
 * `$4` is the supported-language list; a language outside it stays NULL, like
 * the live emitters.
 */
const FILLABLE_PREDICATE = `
  c.id = ci."contactId"
  AND e."eventType" = 'contact_created'
  AND e."occurredAt" >= $1
  AND e."occurredAt" < $2
  AND ($3::bigint IS NULL OR e."workspaceId" = $3::bigint)
  AND ci.id = e."contactId"
  AND c."workspaceId" = e."workspaceId"
  AND (
    (e."inboxId" IS NULL AND ci."inboxId" IS NOT NULL)
    OR (
      e."language" IS NULL
      AND ${BASE_LANGUAGE_SQL} = ANY($4::text[])
    )
  )
`

export const COUNT_SQL = `
  SELECT COUNT(*)::int AS count
  FROM "AnalyticsContactEvent" e, "ContactInbox" ci, "Contact" c
  WHERE ${FILLABLE_PREDICATE}
`

export const UPDATE_SQL = `
  UPDATE "AnalyticsContactEvent" e
  SET
    "inboxId" = COALESCE(e."inboxId", ci."inboxId"),
    "language" = COALESCE(
      e."language",
      CASE
        WHEN ${BASE_LANGUAGE_SQL} = ANY($4::text[])
          THEN ${BASE_LANGUAGE_SQL}
      END
    )
  FROM "ContactInbox" ci, "Contact" c
  WHERE ${FILLABLE_PREDICATE}
`

const qualifiedChunk = (chunk) =>
  `"${chunk.chunk_schema}"."${chunk.chunk_name}"`

async function backfillChunk(pool, chunk, workspaceId, dryRun) {
  const window = [
    chunk.range_start,
    chunk.range_end,
    workspaceId,
    SUPPORTED_LANGUAGES,
  ]

  // Count first: a chunk with nothing to fill is never decompressed, so a
  // re-run (or a resumed run) leaves already-backfilled storage alone.
  const { rows } = await pool.query(COUNT_SQL, window)
  const fillable = rows[0]?.count ?? 0
  if (dryRun || fillable === 0) {
    return { updated: dryRun ? fillable : 0, recompressFailed: false }
  }

  const client = await pool.connect()
  let updated = 0
  try {
    await client.query("BEGIN")
    await client.query(`SET LOCAL lock_timeout = ${LOCK_TIMEOUT_MS}`)
    if (chunk.is_compressed) {
      await client.query("SELECT decompress_chunk($1::regclass, true)", [
        qualifiedChunk(chunk),
      ])
    }
    const result = await client.query(UPDATE_SQL, window)
    updated = result.rowCount ?? 0
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }

  if (!chunk.is_compressed) {
    return { updated, recompressFailed: false }
  }
  try {
    await pool.query("SELECT compress_chunk($1::regclass, true)", [
      qualifiedChunk(chunk),
    ])
    return { updated, recompressFailed: false }
  } catch (error) {
    console.error(
      `  could not re-compress ${qualifiedChunk(chunk)}; the compression policy will retry: ${error.message}`,
    )
    return { updated, recompressFailed: true }
  }
}

export async function run({ pool, dryRun, workspaceId, log = console.log }) {
  const { rows: chunks } = await pool.query(LIST_CHUNKS_SQL)
  log(
    `${dryRun ? "[dry run] " : ""}${chunks.length} chunk(s)${workspaceId ? ` for workspace ${workspaceId}` : ""}`,
  )

  let total = 0
  let recompressFailures = 0
  for (const [index, chunk] of chunks.entries()) {
    const { updated, recompressFailed } = await backfillChunk(
      pool,
      chunk,
      workspaceId,
      dryRun,
    )
    total += updated
    recompressFailures += recompressFailed ? 1 : 0
    log(
      `[${index + 1}/${chunks.length}] ${qualifiedChunk(chunk)} ${dryRun ? "would update" : "updated"} ${updated}`,
    )
  }
  log(
    `${dryRun ? "Would update" : "Updated"} ${total} contact_created row(s)` +
      (recompressFailures > 0
        ? `; ${recompressFailures} chunk(s) left decompressed`
        : ""),
  )
  return { total, recompressFailures }
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("DATABASE_URL is required.")
    process.exit(1)
  }
  const pool = new Pool({ connectionString: databaseUrl, max: 2 })
  try {
    await run({
      pool,
      dryRun: process.env.DRY_RUN === "1",
      workspaceId: process.env.WORKSPACE_ID || null,
    })
  } finally {
    await pool.end()
  }
}
