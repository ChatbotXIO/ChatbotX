import { createAnthropic } from "@ai-sdk/anthropic"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { type AIProvider, aiProviders } from "../schemas"

export const getAIProviderInstance = (provider: AIProvider) => {
  switch (provider) {
    case aiProviders.enum.openai:
      return createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      })
    case aiProviders.enum.gemini:
      return createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      })
    case aiProviders.enum.claude:
      return createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      })
    case aiProviders.enum.deepseek:
      return createDeepSeek({
        apiKey: process.env.DEEPSEEK_API_KEY,
      })
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}
