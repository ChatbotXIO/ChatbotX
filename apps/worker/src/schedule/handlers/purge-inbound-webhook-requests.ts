import { inboundWebhookService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"

const log = getChildLogger("purge-inbound-webhook-requests")

const RETENTION_DAYS = 30
const CHUNK_SIZE = 1000
const INTER_CHUNK_DELAY_MS = 100
const MAX_RUN_DURATION_MS = 10 * 60 * 1000
/** Runaway backstop only — the deadline is the real limit. */
const MAX_CHUNKS_PER_RUN = 10_000

/**
 * Request payloads can carry personal data, so they are kept for a bounded
 * window. Chunked and deadline-bounded like `purgeErrorLogs`, so a long delete
 * never blocks the route inserting new requests.
 */
export async function purgeInboundWebhookRequests(): Promise<void> {
  const { deleted, stopReason } = await inboundWebhookService.purgeRequests({
    retentionDays: RETENTION_DAYS,
    chunkSize: CHUNK_SIZE,
    interChunkDelayMs: INTER_CHUNK_DELAY_MS,
    maxChunks: MAX_CHUNKS_PER_RUN,
    maxRunDurationMs: MAX_RUN_DURATION_MS,
  })

  if (stopReason !== "drained") {
    log.warn(
      { deleted, stopReason },
      "purgeInboundWebhookRequests: stopped with a backlog remaining",
    )
    return
  }
  if (deleted > 0) {
    log.info({ deleted }, "purgeInboundWebhookRequests: rows purged")
  }
}
