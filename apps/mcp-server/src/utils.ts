import { ChatbotXAPI } from "@chatbotx/public-apis"

const trailingSlashRegex = /\/$/

export const formatResult = (value: unknown): string => {
  return JSON.stringify(value, null, 2)
}

export const createApi = (): ChatbotXAPI => {
  const apiKey = process.env.API_KEY?.trim()

  if (!apiKey) {
    throw new Error("Missing API_KEY")
  }

  const apiUrl = process.env.API_URL?.trim().replace(trailingSlashRegex, "")
  const allowSelfSignedCert = process.env.ALLOW_SELF_SIGNED_CERT === "true"

  return new ChatbotXAPI(apiKey, apiUrl, allowSelfSignedCert)
}
