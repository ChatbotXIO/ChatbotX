import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { geminiEmbeddingModels, openaiEmbeddingModels } from "@chatbotx.io/ai"
import { db } from "@chatbotx.io/database/client"
import type { SecretTextAuthValue } from "@chatbotx.io/sdk"
import type { EmbeddingModel } from "ai"

export async function resolveEmbeddingModel(
  workspaceId: string,
): Promise<EmbeddingModel> {
  // Find openAI
  const integrationOpenai = await db.query.integrationOpenaiModel.findFirst({
    where: { workspaceId },
  })
  if (integrationOpenai) {
    const apiKey = (integrationOpenai.auth as SecretTextAuthValue).secretText
    const openai = createOpenAI({ apiKey })

    return openai.embedding(
      openaiEmbeddingModels.enum["text-embedding-ada-002"],
    )
  }

  // Find gemini
  const integrationGemini = await db.query.integrationGeminiModel.findFirst({
    where: { workspaceId },
  })
  if (integrationGemini) {
    const apiKey = (integrationGemini.auth as SecretTextAuthValue).secretText
    const gemini = createGoogleGenerativeAI({ apiKey })

    return gemini.embedding(geminiEmbeddingModels.enum["text-embedding-004"])
  }

  throw new Error("No embedding provider configured")
}
