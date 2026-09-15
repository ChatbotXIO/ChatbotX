import { verifyAiProviderApiKey } from "@chatbotx.io/business/integration-ai-provider/verify"

export const verifyClaudeApiKey = (apiKey: string) =>
  verifyAiProviderApiKey("claude", apiKey)
