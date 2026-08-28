import { db, sql } from "@chatbotx.io/database/client"
import { getChildLogger } from "@chatbotx.io/logger"

const log = getChildLogger("purge-error-logs")

const RETENTION_INTERVAL = sql`INTERVAL '30 days'`
const CHUNK_SIZE = 1000
const INTER_CHUNK_DELAY_MS = 100
/**
 * Wall-clock budget rather than a fixed chunk count. Broadcast and sequence
 * fan-out no longer reaches this table, but a busy workspace whose channel
 * token expires still accumulates one row per inbound event, so a per-run row
 * cap low enough to be "safe" could fall behind and the table would never
 * drain. The schedule worker runs at `concurrency: 5`, so holding one slot for
 * this long does not stall the other crons.
 */
const MAX_RUN_DURATION_MS = 10 * 60 * 1000
/** Runaway backstop only — the deadline is the real limit. */
const MAX_CHUNKS_PER_RUN = 10_000

type PurgedId = { id: string }

type StopReason = "drained" | "deadline" | "chunkCap"

/**
 * `ErrorLog` grows one row per third-party failure, and an inbound burst against
 * a broken integration can add tens of thousands at once. Chunked with
 * `FOR UPDATE SKIP LOCKED` so a long delete never blocks a concurrent insert
 * from a producer, and bounded by `MAX_RUN_DURATION_MS` so one pass cannot
 * monopolise the worker.
 */
export async function purgeErrorLogs(): Promise<void> {
  const deadline = Date.now() + MAX_RUN_DURATION_MS
  let totalDeleted = 0
  let stopReason: StopReason = "drained"

  for (let chunk = 0; ; chunk++) {
    if (chunk >= MAX_CHUNKS_PER_RUN) {
      stopReason = "chunkCap"
      break
    }

    const deleted = await db.execute<PurgedId>(sql`
      DELETE FROM "ErrorLog"
      WHERE id IN (
        SELECT id FROM "ErrorLog"
        WHERE "createdAt" < NOW() - ${RETENTION_INTERVAL}
        ORDER BY "createdAt" ASC
        LIMIT ${CHUNK_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `)

    const count = deleted.rows.length
    totalDeleted += count

    if (count < CHUNK_SIZE) {
      break
    }

    if (Date.now() >= deadline) {
      stopReason = "deadline"
      break
    }

    await new Promise((resolve) => setTimeout(resolve, INTER_CHUNK_DELAY_MS))
  }

  if (stopReason !== "drained") {
    // Rows older than the retention window still remain. Repeated across runs
    // this means `ErrorLog` is growing faster than retention can clear it.
    log.warn(
      { deleted: totalDeleted, stopReason },
      "purgeErrorLogs: stopped with a backlog remaining",
    )
    return
  }

  if (totalDeleted > 0) {
    log.info({ deleted: totalDeleted }, "purgeErrorLogs: rows purged")
  }
}
