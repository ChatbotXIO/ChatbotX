import { COMMENT_AUTOMATION_RETENTION_DAYS } from "@chatbotx.io/analytics/schemas"
import { purgeCommentAutomationEvents as purgeEventRows } from "@chatbotx.io/database/repositories"
import { getChildLogger } from "@chatbotx.io/logger"

const log = getChildLogger("purge-comment-automation-events")

/** Shared with the analytics page's date filter, which must not offer a window
 * wider than what is retained — see the constant's docblock. */
const RETENTION_DAYS = COMMENT_AUTOMATION_RETENTION_DAYS
const CHUNK_SIZE = 1000
const INTER_CHUNK_DELAY_MS = 100
/**
 * Wall-clock budget rather than a fixed chunk count, for the same reason as
 * `purgeErrorLogs`: a Page with a viral post writes one row per matched
 * comment per reply channel, so a per-run row cap low enough to be "safe"
 * could fall behind and the table would never drain.
 */
const MAX_RUN_DURATION_MS = 10 * 60 * 1000
/** Runaway backstop only — the deadline is the real limit. */
const MAX_CHUNKS_PER_RUN = 10_000

/**
 * `FBCommentAutomationEvent` grows one row per dispatched reply, and a busy
 * Page can add tens of thousands a day. Chunked so a long delete never blocks
 * the comment-automation loop writing a new event.
 */
export async function purgeCommentAutomationEvents(): Promise<void> {
  const { deleted, stopReason } = await purgeEventRows({
    retentionDays: RETENTION_DAYS,
    chunkSize: CHUNK_SIZE,
    interChunkDelayMs: INTER_CHUNK_DELAY_MS,
    maxChunks: MAX_CHUNKS_PER_RUN,
    maxRunDurationMs: MAX_RUN_DURATION_MS,
  })

  if (stopReason !== "drained") {
    log.warn(
      { deleted, stopReason },
      "purgeCommentAutomationEvents: stopped with a backlog remaining",
    )
    return
  }

  if (deleted > 0) {
    log.info({ deleted }, "purgeCommentAutomationEvents: rows purged")
  }
}
