import { verifyAiProviderApiKey } from "@chatbotx.io/business/integration-ai-provider/verify"

export const verifyOpenRouterApiKey = (apiKey: string) =>
  verifyAiProviderApiKey("openrouter", apiKey)
