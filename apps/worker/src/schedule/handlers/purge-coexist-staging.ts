import { whatsappCoexistStagingRepository } from "@chatbotx.io/database/repositories"
import { getChildLogger } from "@chatbotx.io/logger"

const log = getChildLogger("purge-coexist-staging")

const RETENTION_HOURS = 48
/**
 * Rows the flush could not parse are kept longer than processed ones: they are
 * the only evidence of a Meta payload-schema change, and a week is enough to
 * notice the error logs and inspect them.
 */
const PARSE_FAILED_RETENTION_DAYS = 7
const CHUNK_SIZE = 500
const MAX_CHUNKS_PER_RUN = 20
const INTER_CHUNK_DELAY_MS = 100

export async function purgeCoexistStaging(): Promise<void> {
  const { deleted } = await whatsappCoexistStagingRepository.purgeProcessed({
    retentionHours: RETENTION_HOURS,
    chunkSize: CHUNK_SIZE,
    interChunkDelayMs: INTER_CHUNK_DELAY_MS,
    maxChunks: MAX_CHUNKS_PER_RUN,
  })

  if (deleted > 0) {
    log.info({ deleted }, "purgeCoexistStaging: rows purged")
  }

  const { deleted: parseFailedDeleted } =
    await whatsappCoexistStagingRepository.purgeParseFailed({
      retentionDays: PARSE_FAILED_RETENTION_DAYS,
      chunkSize: CHUNK_SIZE,
      interChunkDelayMs: INTER_CHUNK_DELAY_MS,
      maxChunks: MAX_CHUNKS_PER_RUN,
    })

  if (parseFailedDeleted > 0) {
    log.info(
      { deleted: parseFailedDeleted },
      "purgeCoexistStaging: unparseable rows purged",
    )
  }
}
