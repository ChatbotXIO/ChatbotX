import { purgeProcessedCoexistStaging } from "@chatbotx.io/database/repositories"
import { getChildLogger } from "@chatbotx.io/logger"

const log = getChildLogger("purge-coexist-staging")

const RETENTION_HOURS = 48
const CHUNK_SIZE = 500
const MAX_CHUNKS_PER_RUN = 20
const INTER_CHUNK_DELAY_MS = 100

export async function purgeCoexistStaging(): Promise<void> {
  const { deleted } = await purgeProcessedCoexistStaging({
    retentionHours: RETENTION_HOURS,
    chunkSize: CHUNK_SIZE,
    interChunkDelayMs: INTER_CHUNK_DELAY_MS,
    maxChunks: MAX_CHUNKS_PER_RUN,
  })

  if (deleted > 0) {
    log.info({ deleted }, "purgeCoexistStaging: rows purged")
  }
}
