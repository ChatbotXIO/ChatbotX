import type { ChatbotXAPI } from "@chatbotx/public-apis"
import {
  createCustomField,
  createCustomFieldInputSchema,
  getCustomField,
  getCustomFieldByName,
  getCustomFieldByNameInputSchema,
  getCustomFieldInputSchema,
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
    inputSchema: createCustomFieldInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput = createCustomFieldInputSchema.parse(input)
        const result = await createCustomField(api, validatedInput)

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
    inputSchema: getCustomFieldInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput = getCustomFieldInputSchema.parse(input)
        const result = await getCustomField(api, validatedInput)

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
    inputSchema: getCustomFieldByNameInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput = getCustomFieldByNameInputSchema.parse(input)
        const result = await getCustomFieldByName(api, validatedInput)

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
