import {
  AI_PROVIDERS,
  AIGenerateImageProvider,
  DEFAULT_IMAGE_MODEL_IDS,
  OPENAI_IMAGE_MODEL_NAMES,
} from "@aha.chat/flow-config"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import type { ImageModel } from "ai"
import { fetchAIProviderConfig } from "../ai-shared-utils"
import type { AIGenerateImageStep, AIImageProviderConfig } from "./types"

export async function getAIImageProviderConfig(
  step: AIGenerateImageStep,
  chatbotId: string,
): Promise<AIImageProviderConfig | null> {
  return (await fetchAIProviderConfig(
    chatbotId,
    step.provider,
    step.model,
  )) as AIImageProviderConfig | null
}

export function createImageModel(
  config: AIImageProviderConfig,
  modelName: string,
): ImageModel {
  switch (config.provider) {
    case AI_PROVIDERS.OPENAI: {
      const openai = createOpenAI({ apiKey: config.apiKey })
      const model =
        modelName === DEFAULT_IMAGE_MODEL_IDS[AIGenerateImageProvider.OPENAI]
          ? OPENAI_IMAGE_MODEL_NAMES.DALLE_3
          : modelName
      return openai.image(model)
    }

    case AI_PROVIDERS.GEMINI: {
      const google = createGoogleGenerativeAI({ apiKey: config.apiKey })
      return google.image(modelName)
    }

    default:
      throw new Error(
        `Unsupported provider for image generation: ${config.provider}`,
      )
  }
}
