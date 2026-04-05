import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { aiEmbeddingModel } from "@chatbotx.io/database/schema"
import type { AIEmbeddingStatus } from "@chatbotx.io/database/types"
import type { AIJobProcessPendingEmbedding } from "@chatbotx.io/worker-config"
import { embed } from "ai"
import { resolveEmbeddingModel } from "../../ai-agent/lib/embedding-model"
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
  if (aiEmbedding.status !== "pending" && aiEmbedding.status !== "processing") {
    throw new Error("AI embedding is processing or already processed")
  }

  try {
    const embeddingModel = await resolveEmbeddingModel(aiEmbedding.workspaceId)

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
