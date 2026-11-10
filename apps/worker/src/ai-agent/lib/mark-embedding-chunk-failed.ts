import { aiFileService } from "@chatbotx.io/business"
import { AIJobAction, type AIJobData } from "@chatbotx.io/worker-config"
import { type Job, UnrecoverableError } from "bullmq"
import { normalizeError } from "universal-error-normalizer"
import { hasExhaustedAttempts } from "../../lib/job-attempts"
import { logger } from "../../lib/logger"

/**
 * A chunk's embedding job that used its last attempt leaves the chunk
 * `pending`, so its file would read "processing" for ever. Mark it `error`
 * instead; `aiFiles.reindex` puts `error` chunks back to `pending` and retries.
 *
 * An `UnrecoverableError` (e.g. the provider rejected the API key) is also the
 * last attempt: BullMQ fails the job without retrying, whatever attempts are
 * left, so the attempt count alone would leave the chunk `pending`.
 */
export async function markEmbeddingChunkFailed(input: {
  job: Job
  jobData: AIJobData
  workspaceId: string | undefined
  error?: unknown
}): Promise<void> {
  const { job, jobData, workspaceId, error: jobError } = input
  if (jobData.type !== AIJobAction.processPendingEmbedding) {
    return
  }
  if (!(jobError instanceof UnrecoverableError || hasExhaustedAttempts(job))) {
    return
  }
  const embeddingId = jobData.data.aiEmbeddingId
  if (!workspaceId) {
    logger.error(
      { embeddingId },
      "Cannot mark AI embedding failed without a workspace",
    )
    return
  }
  try {
    await aiFileService.markEmbeddingFailed({ embeddingId, workspaceId })
  } catch (error) {
    logger.error(
      { err: normalizeError(error), embeddingId, workspaceId },
      "Failed to mark AI embedding failed",
    )
  }
}
