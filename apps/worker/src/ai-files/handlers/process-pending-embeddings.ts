import { prisma, updateAIEmbeddingVector } from "@aha.chat/database"
import { embed } from "ai"
import { logger } from "../../lib/logger"
import { resolveEmbeddingModel } from "../lib/embedding-model"

export async function processPendingEmbeddings({
  chatbotId,
  limit = 50,
}: {
  chatbotId: string
  limit?: number
}) {
  const pending = await prisma.aIEmbedding.findMany({
    where: { chatbotId, status: "pending" },
    orderBy: { createdAt: "asc" },
    take: limit,
  })
  if (pending.length === 0) {
    return 0
  }

  const embeddingModel = await resolveEmbeddingModel(chatbotId)

  let processed = 0
  for (const item of pending) {
    try {
      const { embedding } = await embed({
        model: embeddingModel,
        value: item.content,
      })
      const embeddingString = `[${embedding.join(",")}]`
      await prisma.$queryRawTyped(
        updateAIEmbeddingVector(
          embeddingString,
          new Date(),
          "success",
          item.id,
        ),
      )
      processed += 1
    } catch (error) {
      logger.error("[ai-files] processPendingEmbeddings item failed", {
        error,
        embeddingId: item.id,
        chatbotId,
      })
      await prisma.aIEmbedding.update({
        where: { id: item.id },
        data: { status: "error" },
      })
    }
  }
  return processed
}
