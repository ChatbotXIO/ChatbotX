import type { ChatbotXAPI } from "@aha.chat/public-apis"
import {
  createCustomField,
  getCustomField,
  getCustomFieldByName,
  listCustomFields,
} from "@aha.chat/public-apis/custom-fields"
import { formatResult } from "../utils.js"

type CustomFieldType =
  | "shortText"
  | "number"
  | "date"
  | "datetime"
  | "boolean"
  | "longText"

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
              text: `Custom field list:\n${formatResult(result.data)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error"

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
      {
        name,
        customFieldType,
      }: { name: string; customFieldType: CustomFieldType },
    ) => {
      try {
        const result = await createCustomField(api, { name, customFieldType })

        return {
          content: [
            {
              type: "text" as const,
              text: `Custom field created successfully:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error"

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
    execute: async (api: ChatbotXAPI, { id }: { id: string }) => {
      try {
        const result = await getCustomField(api, id)

        return {
          content: [
            {
              type: "text" as const,
              text: `Custom field details:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error"

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
    execute: async (api: ChatbotXAPI, { name }: { name: string }) => {
      try {
        const result = await getCustomFieldByName(api, name)

        return {
          content: [
            {
              type: "text" as const,
              text: `Custom field details:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error"

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
