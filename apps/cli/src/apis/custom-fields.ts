import type { ChatbotXAPI } from "../api"

const CUSTOM_FIELDS_PREFIX = "/api/v1/custom-fields"

export const listCustomFields = (api: ChatbotXAPI): Promise<unknown> => {
  return api.request(CUSTOM_FIELDS_PREFIX, { method: "GET" })
}
