import { AI_PROVIDERS } from "@aha.chat/flow-config"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import type { LanguageModel } from "ai"
import { fetchAIProviderConfig } from "../ai-shared-utils"
import type { AIGenerateTextStep, AIProviderConfig } from "./types"

export async function getAIProviderConfig(
  step: AIGenerateTextStep,
  chatbotId: string,
): Promise<AIProviderConfig | null> {
  return (await fetchAIProviderConfig(
    chatbotId,
    step.provider,
    step.model,
  )) as AIProviderConfig | null
}

export function createAIModel(
  config: AIProviderConfig,
  modelName: string,
): LanguageModel {
  switch (config.provider) {
    case AI_PROVIDERS.OPENAI: {
      const openai = createOpenAI({ apiKey: config.apiKey })
      return openai(modelName) as LanguageModel
    }

    case AI_PROVIDERS.GEMINI: {
      const google = createGoogleGenerativeAI({ apiKey: config.apiKey })
      return google(modelName) as unknown as LanguageModel
    }

    case AI_PROVIDERS.CLAUDE: {
      const anthropic = createAnthropic({ apiKey: config.apiKey })
      return anthropic(modelName) as unknown as LanguageModel
    }

    case AI_PROVIDERS.DEEPSEEK: {
      const openai = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      })
      return openai(modelName) as LanguageModel
    }

    default:
      throw new Error(`Unsupported provider: ${config.provider}`)
  }
}
