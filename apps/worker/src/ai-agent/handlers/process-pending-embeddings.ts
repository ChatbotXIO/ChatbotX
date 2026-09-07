import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { aiEmbeddingStatuses } from "@chatbotx.io/database/partials"
import { aiEmbeddingModel } from "@chatbotx.io/database/schema"
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
    const { model: embeddingModel } = await resolveEmbeddingModel(
      aiEmbedding.workspaceId,
    )

    const { embedding } = await embed({
      model: embeddingModel,
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
    logger.error(
      error,
      `processPendingEmbedding item failed for embeddingId: ${aiEmbedding.id}`,
    )

    // Preserve the pending state and let BullMQ retry transient provider
    // failures. Acknowledging this job would make the reconciler skip it.
    throw error
  }
}
