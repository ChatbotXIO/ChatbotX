import type { AIProvider } from "@chatbotx.io/ai"

type AIProviderWithCompatible = AIProvider | "openaiCompatible"

const aiProviderLabelKeyByProvider = {
  openai: "aiProviders.openai",
  gemini: "aiProviders.gemini",
  claude: "aiProviders.claude",
  deepseek: "aiProviders.deepseek",
  openrouter: "aiProviders.openrouter",
  muse: "aiProviders.muse",
  openaiCompatible: "aiProviders.openaiCompatible",
} as const satisfies Record<AIProviderWithCompatible, string>

export const getAiProviderLabelKey = (provider: AIProviderWithCompatible) =>
  aiProviderLabelKeyByProvider[provider]
