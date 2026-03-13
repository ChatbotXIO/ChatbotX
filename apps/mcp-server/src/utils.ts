import { ChatbotXAPI } from "@chatbotx/public-apis"

const trailingSlashRegex = /\/$/

export const formatResult = (value: unknown): string => {
  return JSON.stringify(value, null, 2)
}

export const createApi = (): ChatbotXAPI => {
  const apiKey = process.env.CHATBOTX_API_KEY?.trim()

  if (!apiKey) {
    throw new Error("Missing CHATBOTX_API_KEY")
  }

  const apiUrl = process.env.CHATBOTX_API_URL?.trim().replace(
    trailingSlashRegex,
    "",
  )
  const allowSelfSignedCert =
    process.env.CHATBOTX_ALLOW_SELF_SIGNED_CERT === "true"

  return new ChatbotXAPI(apiKey, apiUrl, allowSelfSignedCert)
}
