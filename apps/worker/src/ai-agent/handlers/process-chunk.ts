import { prisma, updateAIEmbeddingVector } from "@aha.chat/database"
import type { AIJobProcessChunk } from "@aha.chat/worker-config"
import { embed } from "ai"
import { resolveEmbeddingModel } from "../../ai-agent/lib/embedding-model"

export async function processChunk(data: AIJobProcessChunk["data"]) {
  const { aiFileId, chatbotId, content } = data

  const embeddingModel = await resolveEmbeddingModel(chatbotId)

  const timeoutMs = 30_000
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error("OpenAI API call timeout after 30 seconds")),
      timeoutMs,
    )
  })

  const embeddingPromise = embed({ model: embeddingModel, value: content })
  const { embedding } = await Promise.race([embeddingPromise, timeoutPromise])

  const embeddingString = `[${embedding.join(",")}]`

  const created = await prisma.aIEmbedding.create({
    data: {
      content,
      chatbotId,
      aiFileId,
    },
  })

  await prisma.$queryRawTyped(
    updateAIEmbeddingVector(embeddingString, new Date(), "success", created.id),
  )
}
