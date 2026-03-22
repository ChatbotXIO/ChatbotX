import { db } from "@aha.chat/database/client"
import type { SecretTextAuthValue } from "@aha.chat/sdk"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
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
  chatbotId: string,
): Promise<EmbeddingModel> {
  const [integrationOpenAI, integrationGemini] = await Promise.all([
    db.query.integrationOpenAIModel.findFirst({
      where: { chatbotId },
    }),
    db.query.integrationGeminiModel.findFirst({
      where: { chatbotId },
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
