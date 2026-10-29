import {
  type ContactExportCursor,
  contactExportService,
} from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"

const log = getChildLogger("purge-expired-contact-exports")
const BATCH_SIZE = 500

/**
 * Daily retention sweep for contact exports: walks the expired rows oldest
 * first, one batch at a time, until a batch comes back short. Each batch
 * starts past the previous one, so files whose storage delete fails (their
 * rows are kept for tomorrow) are skipped rather than retried in a loop.
 */
export async function purgeExpiredContactExports(): Promise<void> {
  const now = new Date()
  let totalDeleted = 0
  let totalFailed = 0
  let after: ContactExportCursor | undefined
  do {
    const batch = await contactExportService.purgeExpired({
      batchSize: BATCH_SIZE,
      now,
      after,
    })
    totalDeleted += batch.deleted
    totalFailed += batch.failed
    after = batch.nextCursor ?? undefined
  } while (after)

  if (totalFailed > 0) {
    log.warn(
      { totalDeleted, totalFailed },
      "purgeExpiredContactExports: some files could not be deleted, they are retried tomorrow",
    )
    return
  }
  if (totalDeleted > 0) {
    log.info({ totalDeleted }, "purgeExpiredContactExports: exports deleted")
  }
}
