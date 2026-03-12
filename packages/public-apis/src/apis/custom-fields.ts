import type { ChatbotXAPI } from "../index"
import type { CustomField } from "../schemas/custom-field"

const CUSTOM_FIELDS_PREFIX = "/custom-fields"

export const listCustomFields = (
  api: ChatbotXAPI,
): Promise<{ data: CustomField[] }> => {
  return api.request(CUSTOM_FIELDS_PREFIX, { method: "GET" })
}

export const createCustomField = (
  api: ChatbotXAPI,
  params: {
    name: string
    customFieldType: CustomField["customFieldType"]
  },
): Promise<CustomField> => {
  return api.request(CUSTOM_FIELDS_PREFIX, {
    method: "POST",
    body: JSON.stringify(params),
  })
}

export const getCustomField = (
  api: ChatbotXAPI,
  id: string,
): Promise<CustomField> => {
  return api.request(`${CUSTOM_FIELDS_PREFIX}/${id}`, { method: "GET" })
}

export const getCustomFieldByName = (
  api: ChatbotXAPI,
  name: string,
): Promise<CustomField> => {
  return api.request(`${CUSTOM_FIELDS_PREFIX}/name/${name}`, { method: "GET" })
}
