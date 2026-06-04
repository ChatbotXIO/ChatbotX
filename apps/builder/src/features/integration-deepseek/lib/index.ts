import { aiProviders } from "@chatbotx.io/ai"
import { verifyAiProviderApiKey } from "@/features/integration-ai/lib/verify-api-key"

export const verifyDeepSeekApiKey = (apiKey: string) =>
  verifyAiProviderApiKey(aiProviders.enum.deepseek, apiKey)
