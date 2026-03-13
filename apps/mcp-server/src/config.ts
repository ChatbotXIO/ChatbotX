import type { ChatbotXConfig } from "@chatbotx/public-apis"
import { env } from "./env"

const trailingSlashRegex = /\/$/

export const getChatbotXConfigFromEnv = (): ChatbotXConfig => {
  const apiKey = env.CHATBOTX_API_KEY.trim()
  const apiUrl = env.CHATBOTX_API_URL.trim().replace(trailingSlashRegex, "")
  const allowSelfSignedCert = env.CHATBOTX_ALLOW_SELF_SIGNED_CERT === "true"

  return {
    apiKey,
    apiUrl,
    allowSelfSignedCert,
  }
}
