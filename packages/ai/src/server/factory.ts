import { db } from "@chatbotx.io/database/client"
import type {
  IntegrationClaudeModel,
  IntegrationDeepseekModel,
  IntegrationGeminiModel,
  IntegrationOpenAIModel,
  IntegrationOpenrouterModel,
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
  | IntegrationOpenrouterModel

export type AIProviderInstance = ReturnType<
  (typeof providerSdkFactories)[keyof typeof providerSdkFactories]
>

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
    case aiProviders.enum.openrouter:
      return await db.query.integrationOpenrouterModel.findFirst({
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

export function createAIProviderInstance(props: {
  model: AIIntegrationModel
  provider: string
}): AIProviderInstance {
  const { model, provider } = props
  const authParsed = secretTextAuthSchema.safeParse(model.auth)
  if (!authParsed.success) {
    throw new Error("Invalid AI integration auth configuration")
  }

  const createProvider = resolveProviderFactory(provider)

  return createProvider({ apiKey: authParsed.data.secretText })
}

export function getAIModel(model: AIIntegrationModel, provider: string) {
  return createAIProviderInstance({ model, provider })
}

const legacyModelIdMap: Partial<Record<AIProvider, Record<string, string>>> = {
  [aiProviders.enum.claude]: {
    "claude-opus-4.6": "claude-opus-4-6",
    "claude-4.5-haiku-20251001": "claude-haiku-4-5-20251001",
    "claude-4.5-sonnet-20250929": "claude-sonnet-4-5-20250929",
    "claude-sonnet-4.5-20250929": "claude-sonnet-4-5-20250929",
    "claude-4.5-opus-20251101": "claude-opus-4-5-20251101",
  },
  [aiProviders.enum.deepseek]: {
    "deepseek-chat": "deepseek-v4-flash",
    "deepseek-reasoner": "deepseek-v4-pro",
  },
  [aiProviders.enum.openrouter]: {
    "anthropic/claude-3-5-sonnet": "anthropic/claude-sonnet-4.5",
    "anthropic/claude-3-5-haiku": "anthropic/claude-haiku-4.5",
    "google/gemini-2.0-flash": "google/gemini-2.5-flash",
    "meta-llama/llama-3.2-90b-vision-instruct":
      "meta-llama/llama-3.2-11b-vision-instruct",
    "deepseek/deepseek-chat": "deepseek/deepseek-v4-flash",
    "qwen/qwen-2.5-72b-instruct": "qwen/qwen3-max",
  },
}

export function normalizeAIModelId(provider: string, modelId: string) {
  const parsed = aiProviders.safeParse(provider)
  if (!parsed.success) {
    return modelId
  }

  return legacyModelIdMap[parsed.data]?.[modelId] ?? modelId
}

export function createAIModelInstance(props: {
  model: AIIntegrationModel
  provider: string
  modelId: string
  traceId?: string
}) {
  const { model, provider, modelId } = props
  const providerInstance = createAIProviderInstance({ model, provider })
  const normalizedModelId = normalizeAIModelId(provider, modelId)

  return providerInstance(normalizedModelId)
}

export function createAIImageModelInstance(props: {
  model: AIIntegrationModel
  provider: string
  modelId: string
}) {
  const { model, provider, modelId } = props
  const authParsed = secretTextAuthSchema.safeParse(model.auth)
  if (!authParsed.success) {
    throw new Error("Invalid AI integration auth configuration")
  }

  const createProvider = resolveProviderFactory(provider)

  // OpenAI removed `response_format` from the images endpoint. The AI SDK
  // still adds it for dall-e models, so we strip it and convert URL responses
  // to base64 inline so the SDK schema validation still passes.
  const isDallE =
    provider === aiProviders.enum.openai && modelId.startsWith("dall-e")

  const providerInstance = createProvider({
    apiKey: authParsed.data.secretText,
    ...(isDallE ? { fetch: createDallEImageFetch() } : {}),
  })

  if ("image" in providerInstance) {
    return providerInstance.image(modelId) as ImageModel
  }

  throw new Error(`Provider ${provider} does not support image generation`)
}

function createDallEImageFetch(): typeof globalThis.fetch {
  return async (url, inputInit) => {
    const urlStr = url instanceof URL ? url.href : String(url)

    if (!urlStr.includes("/images/generations")) {
      return globalThis.fetch(url, inputInit)
    }

    let patchedInit = inputInit
    if (inputInit?.body && typeof inputInit.body === "string") {
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(inputInit.body) as Record<string, unknown>
        const { response_format: _stripped, ...rest } = parsed
        patchedInit = { ...inputInit, body: JSON.stringify(rest) }
      } catch {
        // leave body unchanged if parsing fails
        patchedInit = inputInit
      }
    }

    const response = await globalThis.fetch(url, patchedInit)
    if (!response.ok) {
      return response
    }

    const text = await response.text()
    let json: {
      data?: Array<{
        url?: string
        b64_json?: string
        revised_prompt?: string
      }>
    }
    try {
      json = JSON.parse(text)
    } catch {
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    }

    if (!Array.isArray(json.data)) {
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    }

    json.data = await Promise.all(
      json.data.map(async (item) => {
        if (item.url && !item.b64_json) {
          const imgRes = await globalThis.fetch(item.url)
          if (!imgRes.ok) {
            return item
          }
          const buf = await imgRes.arrayBuffer()
          return { ...item, b64_json: Buffer.from(buf).toString("base64") }
        }
        return item
      }),
    )

    return new Response(JSON.stringify(json), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
}
