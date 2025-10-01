import { prisma } from "@aha.chat/database"
import type { SecretTextAuthValue } from "@aha.chat/sdk"
import { createOpenAI } from "@ai-sdk/openai"
import { embed } from "ai"
import { OPENAI_EMBEDDING_MODELS } from "../../integration/handlers/automated-response/constants"

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

    const integrationOpenAI = await prisma.integrationOpenAI.findFirst({
        where: { chatbotId, autoReply: true },
    })
    if (!integrationOpenAI) {
        throw new Error("OpenAI integration not found")
    }

    const apiKey = (integrationOpenAI.auth as SecretTextAuthValue | null)?.secretText
    const openai = createOpenAI({ apiKey })
    const embeddingModel = openai.embedding(OPENAI_EMBEDDING_MODELS.TEXT_EMBEDDING_ADA_002)

    let processed = 0
    for (const item of pending) {
        try {
            const { embedding } = await embed({ model: embeddingModel, value: item.content })
            const embeddingString = `[${embedding.join(",")}]`
            await prisma.$executeRaw`
        UPDATE "AIEmbedding"
        SET "embedding" = ${embeddingString}::vector, "updatedAt" = ${new Date()}, "status" = 'success'
        WHERE "id" = ${item.id}
      `
            processed++
        } catch (_) {
            await prisma.aIEmbedding.update({ where: { id: item.id }, data: { status: "error" } })
        }
    }
    return processed
}


