import { prisma } from "@aha.chat/database"
import { AI_PROVIDERS, AIGenerateTextProvider } from "@aha.chat/flow-config"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import type { LanguageModel } from "ai"
import type { AIGenerateTextStep, AIProviderConfig } from "./types"

export async function getAIProviderConfig(
  step: AIGenerateTextStep,
  chatbotId: string,
): Promise<AIProviderConfig | null> {
  const provider = (step as { provider?: string }).provider

  if (provider === undefined || step.model === undefined) {
    return null
  }

  switch (provider) {
    case AIGenerateTextProvider.OPENAI: {
      const integration = await prisma.integrationOpenAI.findFirst({
        where: { chatbotId },
      })

      if (!integration?.autoReply) {
        return null
      }

      const auth = integration.auth as { secretText?: string } | undefined
      const apiKey = auth?.secretText

      if (!apiKey?.trim()) {
        return null
      }

      return {
        provider: AI_PROVIDERS.OPENAI,
        model: step.model,
        apiKey,
      }
    }

    case AIGenerateTextProvider.GEMINI: {
      const integration = await prisma.integrationGemini.findFirst({
        where: { chatbotId },
      })

      if (!integration?.autoReply) {
        return null
      }

      const auth = integration.auth as { secretText?: string } | undefined
      const apiKey = auth?.secretText

      if (!apiKey?.trim()) {
        return null
      }

      return {
        provider: AI_PROVIDERS.GEMINI,
        model: step.model,
        apiKey,
      }
    }

    default:
      return null
  }
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
