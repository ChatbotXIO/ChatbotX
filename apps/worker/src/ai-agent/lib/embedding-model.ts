import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { geminiEmbeddingModels, openaiEmbeddingModels } from "@chatbotx.io/ai"
import {
  integrationGeminiService,
  integrationOpenAIService,
} from "@chatbotx.io/business"
import type { SecretTextAuthValue } from "@chatbotx.io/sdk"
import type { EmbeddingModel } from "ai"

export async function resolveEmbeddingModel(
  workspaceId: string,
): Promise<EmbeddingModel> {
  // Find openAI
  const integrationOpenai =
    await integrationOpenAIService.findByWorkspaceId(workspaceId)
  if (integrationOpenai) {
    const apiKey = (integrationOpenai.auth as SecretTextAuthValue).secretText
    const openai = createOpenAI({ apiKey })

    return openai.embedding(
      openaiEmbeddingModels.enum["text-embedding-ada-002"],
    )
  }

  // Find gemini
  const integrationGemini =
    await integrationGeminiService.findByWorkspaceId(workspaceId)
  if (integrationGemini) {
    const apiKey = (integrationGemini.auth as SecretTextAuthValue).secretText
    const gemini = createGoogleGenerativeAI({ apiKey })

    return gemini.embedding(geminiEmbeddingModels.enum["text-embedding-004"])
  }

  throw new Error(
    "No embedding provider configured. AI file embeddings require OpenAI or Gemini integration. DeepSeek and Claude do not support embedding models.",
  )
}
