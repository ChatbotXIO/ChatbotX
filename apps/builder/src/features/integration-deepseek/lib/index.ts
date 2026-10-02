import { verifyAiProviderApiKey } from "@chatbotx.io/business/integration-ai-provider/verify"

export const verifyDeepSeekApiKey = (apiKey: string) =>
  verifyAiProviderApiKey("deepseek", apiKey)
