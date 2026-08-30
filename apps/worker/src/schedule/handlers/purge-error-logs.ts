import { purgeErrorLogs as purgeErrorLogRows } from "@chatbotx.io/database/repositories"
import { getChildLogger } from "@chatbotx.io/logger"

const log = getChildLogger("purge-error-logs")

const RETENTION_DAYS = 30
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

/**
 * `ErrorLog` grows one row per third-party failure, and an inbound burst against
 * a broken integration can add tens of thousands at once. Chunked so a long
 * delete never blocks a concurrent insert from a producer, and bounded by
 * `MAX_RUN_DURATION_MS` so one pass cannot monopolise the worker.
 */
export async function purgeErrorLogs(): Promise<void> {
  const { deleted, stopReason } = await purgeErrorLogRows({
    retentionDays: RETENTION_DAYS,
    chunkSize: CHUNK_SIZE,
    interChunkDelayMs: INTER_CHUNK_DELAY_MS,
    maxChunks: MAX_CHUNKS_PER_RUN,
    maxRunDurationMs: MAX_RUN_DURATION_MS,
  })

  if (stopReason !== "drained") {
    // Rows older than the retention window still remain. Repeated across runs
    // this means `ErrorLog` is growing faster than retention can clear it.
    log.warn(
      { deleted, stopReason },
      "purgeErrorLogs: stopped with a backlog remaining",
    )
    return
  }

  if (deleted > 0) {
    log.info({ deleted }, "purgeErrorLogs: rows purged")
  }
}
