import { isInvalidApiKeyError } from "@chatbotx.io/ai"
import type { EmbeddingProvider } from "@chatbotx.io/ai/server"
import { logProviderError } from "@chatbotx.io/business/error-log"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { aiEmbeddingStatuses } from "@chatbotx.io/database/partials"
import { aiEmbeddingModel } from "@chatbotx.io/database/schema"
import type { AIJobProcessPendingEmbedding } from "@chatbotx.io/worker-config"
import { embed } from "ai"
import { UnrecoverableError } from "bullmq"
import { resolveEmbeddingModel } from "../../ai-agent/lib/embedding-model"
import { aiErrorLogProvider } from "../../integration/handlers/shared/ai-error-log-provider"
import { logger } from "../../lib/logger"

export async function processPendingEmbedding(
  data: AIJobProcessPendingEmbedding["data"],
) {
  const aiEmbedding = await findOrFail({
    table: aiEmbeddingModel,
    where: {
      id: data.aiEmbeddingId,
    },
    message: "AI embedding not found",
  })
  // A reindex that starts while chunks are still pending enqueues them again;
  // the duplicate job has nothing left to do.
  if (aiEmbedding.status === aiEmbeddingStatuses.enum.success) {
    return
  }
  if (aiEmbedding.status !== "pending" && aiEmbedding.status !== "processing") {
    throw new Error("AI embedding is processing or already processed")
  }

  let provider: EmbeddingProvider | undefined
  try {
    const resolved = await resolveEmbeddingModel(aiEmbedding.workspaceId)
    provider = resolved.provider

    const { embedding } = await embed({
      model: resolved.model,
      value: aiEmbedding.content,
      providerOptions: {
        google: { outputDimensionality: 1536 },
      },
    })

    await db
      .update(aiEmbeddingModel)
      .set({
        embedding: embedding as number[],
        updatedAt: new Date(),
        status: aiEmbeddingStatuses.enum.success,
      })
      .where(eq(aiEmbeddingModel.id, aiEmbedding.id))
  } catch (error) {
    if (provider && isInvalidApiKeyError(error)) {
      // Every retry would be rejected the same way. Surface it on the
      // workspace's Error Logs, then fail without retrying: the worker's
      // `failed` hook logs the job and marks the chunk `error`, which a
      // reindex puts back to `pending` once the key is fixed.
      await logProviderError({
        provider: aiErrorLogProvider(provider),
        workspaceId: aiEmbedding.workspaceId,
        error,
      })
      throw new UnrecoverableError(
        `Embedding provider rejected the API key: ${error.message}`,
      )
    }

    logger.error(
      error,
      `processPendingEmbedding item failed for embeddingId: ${aiEmbedding.id}`,
    )

    // Preserve the pending state and let BullMQ retry transient provider
    // failures. Acknowledging this job would make the reconciler skip it.
    throw error
  }
}
