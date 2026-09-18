import { callRecordingService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"

const log = getChildLogger("purge-expired-call-recordings")
const BATCH_SIZE = 500

/**
 * Daily retention sweep: deletes each expired recording's S3
 * object and clears `recordingPath`/`recordedAt` (the transcript is kept).
 * Loops batches until a pass returns fewer than `BATCH_SIZE` rows, matching
 * the repository's cursor-by-limit contract.
 */
export async function purgeExpiredCallRecordings(): Promise<void> {
  let totalPurged = 0
  for (;;) {
    const purged = await callRecordingService.purgeExpiredRecordings({
      batchSize: BATCH_SIZE,
    })
    totalPurged += purged
    if (purged < BATCH_SIZE) {
      break
    }
  }
  if (totalPurged > 0) {
    log.info({ totalPurged }, "Purged expired WhatsApp call recordings")
  }
}
