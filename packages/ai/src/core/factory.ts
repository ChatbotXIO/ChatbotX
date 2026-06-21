import { createAnthropic } from "@ai-sdk/anthropic"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { type AIProvider, aiProviders } from "../schemas"

/**
 * SDK provider-factory per AI provider. Shared with the server factory so that
 * adding a new provider only requires a single entry here.
 */
export const providerSdkFactories = {
  [aiProviders.enum.openai]: createOpenAI,
  [aiProviders.enum.gemini]: createGoogleGenerativeAI,
  [aiProviders.enum.claude]: createAnthropic,
  [aiProviders.enum.deepseek]: createDeepSeek,
  [aiProviders.enum.openrouter]: createOpenRouter,
} as const satisfies Record<AIProvider, unknown>

const providerApiKeyEnvVar: Record<AIProvider, string> = {
  [aiProviders.enum.openai]: "OPENAI_API_KEY",
  [aiProviders.enum.gemini]: "GOOGLE_GENERATIVE_AI_API_KEY",
  [aiProviders.enum.claude]: "ANTHROPIC_API_KEY",
  [aiProviders.enum.deepseek]: "DEEPSEEK_API_KEY",
  [aiProviders.enum.openrouter]: "OPENROUTER_API_KEY",
}

export const getAIProviderInstance = (provider: AIProvider) => {
  const createProvider = providerSdkFactories[provider]
  return createProvider({ apiKey: process.env[providerApiKeyEnvVar[provider]] })
}
