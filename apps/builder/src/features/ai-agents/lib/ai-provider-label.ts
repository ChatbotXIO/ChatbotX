import type { AIGenerateTextSchema } from "@chatbotx.io/flow-config"

type AIProvider = AIGenerateTextSchema["provider"]

const aiProviderLabelKeyByProvider = {
  openai: "aiProviders.openai",
  gemini: "aiProviders.gemini",
  claude: "aiProviders.claude",
  deepseek: "aiProviders.deepseek",
  openrouter: "aiProviders.openrouter",
  openaiCompatible: "aiProviders.openaiCompatible",
} as const satisfies Record<AIProvider, string>

export const getAiProviderLabelKey = (provider: AIProvider) =>
  aiProviderLabelKeyByProvider[provider]
