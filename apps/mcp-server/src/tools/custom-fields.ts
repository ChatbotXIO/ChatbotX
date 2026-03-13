import type { ChatbotXAPI } from "@chatbotx/public-apis"
import {
  createCustomField,
  getCustomField,
  getCustomFieldByName,
  listCustomFields,
} from "@chatbotx/public-apis"
import { formatResult } from "../utils"

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : "Unknown error"
}

export default {
  list_custom_fields: {
    description: "Get a list of all custom fields in the system.",
    execute: async (api: ChatbotXAPI) => {
      try {
        const result = await listCustomFields(api)

        return {
          content: [
            {
              type: "text" as const,
              text: `Custom field list:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch custom field list: ${message}`,
            },
          ],
        }
      }
    },
  },
  create_custom_field: {
    description: "Create a new custom field with the given name.",
    execute: async (
      api: ChatbotXAPI,
      input: Parameters<typeof createCustomField>[1],
    ) => {
      try {
        const result = await createCustomField(api, input)

        return {
          content: [
            {
              type: "text" as const,
              text: `Custom field created successfully:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to create custom field: ${message}`,
            },
          ],
        }
      }
    },
  },
  get_custom_field: {
    description: "Get a custom field by its ID.",
    execute: async (
      api: ChatbotXAPI,
      input: Parameters<typeof getCustomField>[1],
    ) => {
      try {
        const result = await getCustomField(api, input)

        return {
          content: [
            {
              type: "text" as const,
              text: `Custom field details:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch custom field: ${message}`,
            },
          ],
        }
      }
    },
  },
  get_custom_field_by_name: {
    description: "Get a custom field by its name.",
    execute: async (
      api: ChatbotXAPI,
      input: Parameters<typeof getCustomFieldByName>[1],
    ) => {
      try {
        const result = await getCustomFieldByName(api, input)

        return {
          content: [
            {
              type: "text" as const,
              text: `Custom field details:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch custom field: ${message}`,
            },
          ],
        }
      }
    },
  },
}
