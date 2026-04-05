import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { db } from "@chatbotx.io/database/client"
import type { SecretTextAuthValue } from "@chatbotx.io/sdk"
import {
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  OPENAI_EMBEDDING_MODELS,
} from "../../integration/handlers/automated-response/constants"

export type EmbeddingModel =
  | ReturnType<ReturnType<typeof createOpenAI>["embedding"]>
  | ReturnType<
      ReturnType<typeof createGoogleGenerativeAI>["textEmbeddingModel"]
    >

export async function resolveEmbeddingModel(
  workspaceId: string,
): Promise<EmbeddingModel> {
  const [integrationOpenAI, integrationGemini] = await Promise.all([
    db.query.integrationOpenaiModel.findFirst({
      where: { workspaceId },
    }),
    db.query.integrationGeminiModel.findFirst({
      where: { workspaceId },
    }),
  ])

  if (integrationOpenAI) {
    const apiKey = (integrationOpenAI.auth as SecretTextAuthValue | null)
      ?.secretText
    const openai = createOpenAI({ apiKey })
    return openai.embedding(OPENAI_EMBEDDING_MODELS.TEXT_EMBEDDING_ADA_002)
  }

  if (integrationGemini) {
    const apiKey = (integrationGemini.auth as SecretTextAuthValue | null)
      ?.secretText
    const gemini = createGoogleGenerativeAI({ apiKey })
    return gemini.textEmbeddingModel(DEFAULT_GEMINI_EMBEDDING_MODEL)
  }

  throw new Error("No embedding provider configured (OpenAI/Gemini)")
}
