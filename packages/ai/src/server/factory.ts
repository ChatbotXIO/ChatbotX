import { createAnthropic } from "@ai-sdk/anthropic"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { db } from "@chatbotx.io/database/client"
import type {
  IntegrationGeminiModel,
  IntegrationOpenAIModel,
} from "@chatbotx.io/database/types"
import { secretTextAuthSchema } from "@chatbotx.io/sdk"
import type { ImageModel } from "ai"
import { aiProviders } from "../schemas"

export async function getAIIntegrationInDB(props: {
  workspaceId: string
  provider: string
  autoReply?: boolean
}) {
  const { workspaceId, provider, autoReply } = props

  const where = {
    workspaceId,
    ...(autoReply === undefined ? {} : { autoReply }),
  }

  switch (provider) {
    case aiProviders.enum.openai:
      return await db.query.integrationOpenaiModel.findFirst({
        where,
      })
    case aiProviders.enum.gemini:
      return await db.query.integrationGeminiModel.findFirst({
        where,
      })
    default:
      return null
  }
}

export function getAIModel(
  model: IntegrationOpenAIModel | IntegrationGeminiModel,
  provider: string,
  _options?: { abortSignal?: AbortSignal },
) {
  const authParsed = secretTextAuthSchema.safeParse(model.auth)
  if (!authParsed.success) {
    throw new Error("Invalid AI integration auth configuration")
  }

  const commonSettings = {
    apiKey: authParsed.data.secretText,
    maxRetries: 3,
  }

  switch (provider) {
    case aiProviders.enum.openai: {
      return createOpenAI(commonSettings)
    }
    case aiProviders.enum.gemini: {
      return createGoogleGenerativeAI(commonSettings)
    }
    case aiProviders.enum.claude: {
      return createAnthropic(commonSettings)
    }
    case aiProviders.enum.deepseek: {
      return createDeepSeek(commonSettings)
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}

export function createAIModelInstance(props: {
  model: IntegrationOpenAIModel | IntegrationGeminiModel
  provider: string
  modelId: string
  abortSignal?: AbortSignal
  traceId?: string
}) {
  const { model, provider, modelId, abortSignal } = props
  const providerInstance = getAIModel(model, provider, { abortSignal })

  return providerInstance(modelId)
}

export function createAIImageModelInstance(props: {
  model: IntegrationOpenAIModel | IntegrationGeminiModel
  provider: string
  modelId: string
  abortSignal?: AbortSignal
}) {
  const { model, provider, modelId, abortSignal } = props
  const providerInstance = getAIModel(model, provider, {
    abortSignal,
  })

  if ("image" in providerInstance) {
    return providerInstance.image(modelId) as ImageModel
  }

  throw new Error(`Provider ${provider} does not support image generation`)
}
