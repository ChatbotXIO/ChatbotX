import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { db } from "@chatbotx.io/database/client"
import { secretTextAuthSchema } from "@chatbotx.io/sdk"
import type { EmbeddingModel } from "ai"
import { geminiEmbeddingModels, openaiEmbeddingModels } from "../models"

export type EmbeddingProvider = "openai" | "gemini"

export type ResolvedEmbeddingModel = {
  model: EmbeddingModel
  provider: EmbeddingProvider
}

export async function resolveEmbeddingModel(
  workspaceId: string,
): Promise<ResolvedEmbeddingModel> {
  const integrationOpenai = await db.query.integrationOpenaiModel.findFirst({
    where: { workspaceId },
  })

  if (integrationOpenai) {
    const authParsed = secretTextAuthSchema.safeParse(integrationOpenai.auth)
    if (!(authParsed.success && authParsed.data.secretText)) {
      throw new Error("Invalid OpenAI integration auth configuration")
    }

    return {
      model: createOpenAI({ apiKey: authParsed.data.secretText }).embedding(
        openaiEmbeddingModels.enum["text-embedding-ada-002"],
      ),
      provider: "openai",
    }
  }

  const integrationGemini = await db.query.integrationGeminiModel.findFirst({
    where: { workspaceId },
  })

  if (integrationGemini) {
    const authParsed = secretTextAuthSchema.safeParse(integrationGemini.auth)
    if (!(authParsed.success && authParsed.data.secretText)) {
      throw new Error("Invalid Gemini integration auth configuration")
    }

    return {
      model: createGoogleGenerativeAI({
        apiKey: authParsed.data.secretText,
      }).embedding(geminiEmbeddingModels.enum["gemini-embedding-001"]),
      provider: "gemini",
    }
  }

  throw new Error(
    "No embedding provider configured. AI file embeddings require OpenAI or Gemini integration. DeepSeek and Claude do not support embedding models.",
  )
}
