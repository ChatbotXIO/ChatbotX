import { prisma } from "@aha.chat/database"
import type { SecretTextAuthValue } from "@aha.chat/sdk"
import type { ProcessChunkData } from "@aha.chat/worker-config"
import { createOpenAI } from "@ai-sdk/openai"
import { embed } from "ai"
import { OPENAI_EMBEDDING_MODELS } from "../../integration/handlers/automated-response/constants"

export async function processChunk(data: ProcessChunkData) {
  const { aiFileId, chatbotId, content } = data

  const integrationOpenAI = await prisma.integrationOpenAI.findFirst({
    where: { chatbotId, autoReply: true },
  })
  if (!integrationOpenAI) {
    throw new Error("OpenAI integration not found")
  }

  const apiKey = (integrationOpenAI.auth as SecretTextAuthValue | null)
    ?.secretText
  const openai = createOpenAI({ apiKey })
  const embeddingModel = openai.embedding(OPENAI_EMBEDDING_MODELS.TEXT_EMBEDDING_ADA_002)

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

  await prisma.$executeRaw`
    UPDATE "AIEmbedding"
    SET "embedding" = ${embeddingString}::vector, "updatedAt" = ${new Date()}
    WHERE "id" = ${created.id}
  `
}
