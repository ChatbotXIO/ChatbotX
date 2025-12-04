import { prisma } from "@aha.chat/database"
import { AI_PROVIDERS } from "@aha.chat/database/types"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import type { LanguageModel } from "ai"
import { logger } from "../../../lib/logger"
import type { AIGenerateTextStep, AIProviderConfig } from "./types"

export async function getAIProviderConfig(
  step: AIGenerateTextStep,
  chatbotId: string,
): Promise<AIProviderConfig | null> {
  const provider = (step as { provider?: string }).provider

  if (!provider) {
    logger.error("[ai-generate-text] Provider not specified", {
      stepId: step.id,
    })
    return null
  }

  switch (provider) {
    case "openai": {
      const integration = await prisma.integrationOpenAI.findFirst({
        where: { chatbotId },
      })

      if (!integration?.autoReply) {
        logger.warn(
          "[ai-generate-text] OpenAI integration not found or disabled",
          {
            chatbotId,
          },
        )
        return null
      }

      if (!step.model) {
        logger.error("[ai-generate-text] OpenAI model not specified", {
          stepId: step.id,
        })
        return null
      }

      const auth = integration.auth as { secretText?: string } | undefined
      const apiKey = auth?.secretText

      if (!apiKey || apiKey.trim().length === 0) {
        logger.error("[ai-generate-text] OpenAI API key not found or empty", {
          stepId: step.id,
          chatbotId,
        })
        return null
      }

      return {
        provider: AI_PROVIDERS.OPENAI,
        model: step.model,
        apiKey,
      }
    }

    case "gemini": {
      const integration = await prisma.integrationGemini.findFirst({
        where: { chatbotId },
      })

      if (!integration) {
        logger.warn("[ai-generate-text] Gemini integration not found", {
          chatbotId,
        })
        return null
      }

      if (!step.model) {
        logger.error("[ai-generate-text] Gemini model not specified", {
          stepId: step.id,
        })
        return null
      }

      const auth = integration.auth as { secretText?: string } | null
      const apiKey = auth?.secretText

      if (!apiKey || apiKey.trim().length === 0) {
        logger.error("[ai-generate-text] Gemini API key not found or empty", {
          stepId: step.id,
          chatbotId,
        })
        return null
      }

      return {
        provider: AI_PROVIDERS.GEMINI,
        model: step.model,
        apiKey,
      }
    }

    case "claude": {
      logger.warn("[ai-generate-text] Claude integration not yet implemented")
      return null
    }

    case "deepseek": {
      logger.warn("[ai-generate-text] DeepSeek integration not yet implemented")
      return null
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
