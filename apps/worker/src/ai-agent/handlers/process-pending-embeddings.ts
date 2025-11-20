import {
  AIEmbeddingStatus,
  prisma,
  updateAIEmbeddingVector,
} from "@aha.chat/database"
import type { AIJobProcessPendingEmbedding } from "@aha.chat/worker-config"
import { embed } from "ai"
import { resolveEmbeddingModel } from "../../ai-agent/lib/embedding-model"
import { aiLogger } from "../../lib/logger"

export async function processPendingEmbedding(
  data: AIJobProcessPendingEmbedding["data"],
) {
  const aiEmbedding = await prisma.aIEmbedding.findUnique({
    where: { id: data.aiEmbeddingId },
  })
  if (!aiEmbedding) {
    throw new Error("AI embedding not found")
  }
  if (
    aiEmbedding.status !== AIEmbeddingStatus.pending &&
    aiEmbedding.status !== AIEmbeddingStatus.processing
  ) {
    throw new Error("AI embedding is processing or already processed")
  }

  const embeddingModel = await resolveEmbeddingModel(aiEmbedding.chatbotId)

  try {
    const { embedding } = await embed({
      model: embeddingModel,
      value: aiEmbedding.content,
    })
    const embeddingString = `[${embedding.join(",")}]`
    await prisma.$queryRawTyped(
      updateAIEmbeddingVector(
        embeddingString,
        new Date(),
        AIEmbeddingStatus.success,
        aiEmbedding.id,
      ),
    )
  } catch (error) {
    aiLogger.error("processPendingEmbedding item failed", {
      error,
      embeddingId: aiEmbedding.id,
    })

    await prisma.aIEmbedding.update({
      where: { id: aiEmbedding.id },
      data: { status: AIEmbeddingStatus.error },
    })
  }
}
