import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { aiEmbeddingStatuses } from "@chatbotx.io/database/partials"
import { aiConversationEmbeddingModel } from "@chatbotx.io/database/schema"
import type { AIJobProcessConversationSourceEmbedding } from "@chatbotx.io/worker-config"
import { embed } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { resolveEmbeddingModel } from "../../ai-agent/lib/embedding-model"
import { logger } from "../../lib/logger"

export async function processConversationSourceEmbedding(
  data: AIJobProcessConversationSourceEmbedding["data"],
) {
  const embeddingItem = await findOrFail({
    table: aiConversationEmbeddingModel,
    where: {
      id: data.conversationEmbeddingId,
    },
    message: "AI conversation embedding not found",
  })

  if (
    embeddingItem.status !== aiEmbeddingStatuses.enum.pending &&
    embeddingItem.status !== aiEmbeddingStatuses.enum.processing
  ) {
    return
  }

  await db
    .update(aiConversationEmbeddingModel)
    .set({
      status: aiEmbeddingStatuses.enum.processing,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(aiConversationEmbeddingModel.id, embeddingItem.id))

  try {
    const embeddingModel = await resolveEmbeddingModel(
      embeddingItem.workspaceId,
    )

    const { embedding } = await embed({
      model: embeddingModel,
      value: embeddingItem.content,
    })

    await db
      .update(aiConversationEmbeddingModel)
      .set({
        embedding: embedding as number[],
        status: aiEmbeddingStatuses.enum.success,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(aiConversationEmbeddingModel.id, embeddingItem.id))
  } catch (error) {
    const normalizedError = normalizeError(error)
    logger.error(
      {
        error: normalizedError,
        conversationEmbeddingId: embeddingItem.id,
        sourceId: embeddingItem.sourceId,
      },
      "[ai-agent] processConversationSourceEmbedding failed",
    )

    await db
      .update(aiConversationEmbeddingModel)
      .set({
        status: aiEmbeddingStatuses.enum.error,
        errorMessage:
          normalizedError.message ||
          "Failed to generate conversation source embedding",
        updatedAt: new Date(),
      })
      .where(eq(aiConversationEmbeddingModel.id, embeddingItem.id))
  }
}
