import { createGoogle } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { db } from "@chatbotx.io/database/client"
import { secretTextAuthSchema } from "@chatbotx.io/sdk"
import type { EmbeddingModel } from "ai"
import { geminiEmbeddingModels, openaiEmbeddingModels } from "../models"

export type EmbeddingProvider = "openai" | "gemini"

/**
 * The workspace has no usable embedding provider: none is connected, or the
 * connected one has no usable key. Permanent until the workspace changes its
 * integrations, unlike a database or network failure while resolving.
 */
export class EmbeddingProviderNotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EmbeddingProviderNotConfiguredError"
  }
}

export type ResolvedEmbeddingModel = {
  model: EmbeddingModel
  modelId: string
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
      throw new EmbeddingProviderNotConfiguredError(
        "Invalid OpenAI integration auth configuration",
      )
    }

    return {
      model: createOpenAI({ apiKey: authParsed.data.secretText }).embedding(
        openaiEmbeddingModels.enum["text-embedding-ada-002"],
      ),
      modelId: openaiEmbeddingModels.enum["text-embedding-ada-002"],
      provider: "openai",
    }
  }

  const integrationGemini = await db.query.integrationGeminiModel.findFirst({
    where: { workspaceId },
  })

  if (integrationGemini) {
    const authParsed = secretTextAuthSchema.safeParse(integrationGemini.auth)
    if (!(authParsed.success && authParsed.data.secretText)) {
      throw new EmbeddingProviderNotConfiguredError(
        "Invalid Gemini integration auth configuration",
      )
    }

    return {
      model: createGoogle({
        apiKey: authParsed.data.secretText,
      }).embedding(geminiEmbeddingModels.enum["gemini-embedding-001"]),
      modelId: geminiEmbeddingModels.enum["gemini-embedding-001"],
      provider: "gemini",
    }
  }

  throw new EmbeddingProviderNotConfiguredError(
    "No embedding provider configured. AI file embeddings require OpenAI or Gemini integration. DeepSeek and Claude do not support embedding models.",
  )
}
