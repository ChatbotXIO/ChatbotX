import { db, eq, findOrFail } from "@aha.chat/database/client"
import { aiEmbeddingModel } from "@aha.chat/database/schema"
import type {
  AIEmbeddingModel,
  AIEmbeddingStatus,
} from "@aha.chat/database/types"
import type { AIJobProcessPendingEmbedding } from "@aha.chat/worker-config"
import { embed } from "ai"
import { resolveEmbeddingModel } from "../../ai-agent/lib/embedding-model"
import { logger } from "../../lib/logger"

export async function processPendingEmbedding(
  data: AIJobProcessPendingEmbedding["data"],
) {
  const aiEmbedding = await findOrFail<AIEmbeddingModel>(
    aiEmbeddingModel,
    {
      id: data.aiEmbeddingId,
    },
    "AI embedding not found",
  )
  if (aiEmbedding.status !== "pending" && aiEmbedding.status !== "processing") {
    throw new Error("AI embedding is processing or already processed")
  }

  try {
    const embeddingModel = await resolveEmbeddingModel(aiEmbedding.chatbotId)

    const { embedding } = await embed({
      model: embeddingModel,
      value: aiEmbedding.content,
    })

    await db
      .update(aiEmbeddingModel)
      .set({
        embedding: embedding as number[],
        updatedAt: new Date(),
        status: "success" as AIEmbeddingStatus,
      })
      .where(eq(aiEmbeddingModel.id, aiEmbedding.id))
  } catch (error) {
    logger.error(
      error,
      `processPendingEmbedding item failed for embeddingId: ${aiEmbedding.id}`,
    )

    await db
      .update(aiEmbeddingModel)
      .set({
        status: "error" as AIEmbeddingStatus,
      })
      .where(eq(aiEmbeddingModel.id, aiEmbedding.id))
  }
}
