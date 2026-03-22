import { createChatbotXAPI } from "@chatbotx/public-apis"
import { getChatbotXConfigFromEnv } from "./config"

export const formatResult = (value: unknown): string => {
  return JSON.stringify(value, null, 2)
}

export const createApi = () => {
  const config = getChatbotXConfigFromEnv()
  return createChatbotXAPI(config)
}
