import { db } from "@chatbotx.io/database/client"
import type {
  IntegrationClaudeModel,
  IntegrationDeepseekModel,
  IntegrationGeminiModel,
  IntegrationOpenAIModel,
} from "@chatbotx.io/database/types"
import { secretTextAuthSchema } from "@chatbotx.io/sdk"
import type { ImageModel } from "ai"
import { providerSdkFactories } from "../core/factory"
import { type AIProvider, aiProviders } from "../schemas"

/**
 * Any AI integration row that carries a `secretText` auth + model config.
 * All provider integrations share this shape, so the factory accepts the union.
 */
export type AIIntegrationModel =
  | IntegrationOpenAIModel
  | IntegrationGeminiModel
  | IntegrationClaudeModel
  | IntegrationDeepseekModel

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
    case aiProviders.enum.claude:
      return await db.query.integrationClaudeModel.findFirst({
        where,
      })
    case aiProviders.enum.deepseek:
      return await db.query.integrationDeepseekModel.findFirst({
        where,
      })
    default:
      return null
  }
}

function resolveProviderFactory(provider: string) {
  const parsed = aiProviders.safeParse(provider)
  if (!parsed.success) {
    throw new Error(`Unsupported provider: ${provider}`)
  }
  return providerSdkFactories[parsed.data as AIProvider]
}

export function getAIModel(model: AIIntegrationModel, provider: string) {
  const authParsed = secretTextAuthSchema.safeParse(model.auth)
  if (!authParsed.success) {
    throw new Error("Invalid AI integration auth configuration")
  }

  // NOTE: retries and cancellation are call-level concerns. They must be passed
  // to `generateText`/`streamText`/`generateImage` (`maxRetries`, `abortSignal`),
  // not to the provider factory, which silently ignores them.
  const createProvider = resolveProviderFactory(provider)

  return createProvider({ apiKey: authParsed.data.secretText })
}

export function createAIModelInstance(props: {
  model: AIIntegrationModel
  provider: string
  modelId: string
  traceId?: string
}) {
  const { model, provider, modelId } = props
  const providerInstance = getAIModel(model, provider)

  return providerInstance(modelId)
}

export function createAIImageModelInstance(props: {
  model: AIIntegrationModel
  provider: string
  modelId: string
}) {
  const { model, provider, modelId } = props
  const providerInstance = getAIModel(model, provider)

  if ("image" in providerInstance) {
    return providerInstance.image(modelId) as ImageModel
  }

  throw new Error(`Provider ${provider} does not support image generation`)
}
