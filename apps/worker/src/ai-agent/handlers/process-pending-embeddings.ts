import { AIEmbeddingStatus, prisma } from "@aha.chat/database"
import type { AIJobProcessPendingEmbedding } from "@aha.chat/worker-config"
import { embed } from "ai"
import { resolveEmbeddingModel } from "../../ai-agent/lib/embedding-model"
import { logger } from "../../lib/logger"

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

  try {
    const embeddingModel = await resolveEmbeddingModel(aiEmbedding.chatbotId)

    const { embedding } = await embed({
      model: embeddingModel,
      value: aiEmbedding.content,
    })
    const embeddingString = `[${embedding.join(",")}]`
    await prisma.$executeRaw`UPDATE "AIEmbedding" SET "embedding" = ${embeddingString}::vector, "updatedAt" = ${new Date()}, "status" = ${AIEmbeddingStatus.success} WHERE "id" = ${aiEmbedding.id}`
  } catch (error) {
    logger.error(
      error,
      `processPendingEmbedding item failed for embeddingId: ${aiEmbedding.id}`,
    )

    await prisma.aIEmbedding.update({
      where: { id: aiEmbedding.id },
      data: { status: AIEmbeddingStatus.error },
    })
  }
}
