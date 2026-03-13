import {
  type ChatbotXAPI,
  deleteBotField,
  deleteBotFieldInputSchema,
  getBotField,
  getBotFieldInputSchema,
  updateBotField,
  updateBotFieldInputSchema,
} from "@chatbotx/public-apis"
import { formatResult } from "../utils"

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : "Unknown error"
}

export default {
  get_bot_field: {
    description: "Get a bot field by its ID.",
    inputSchema: getBotFieldInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput = getBotFieldInputSchema.parse(input)
        const result = await getBotField(api, validatedInput)

        return {
          content: [
            {
              type: "text" as const,
              text: `Bot field details:\n${formatResult(result)}`,
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
              text: `Failed to fetch bot field: ${message}`,
            },
          ],
        }
      }
    },
  },
  update_bot_field: {
    description: "Update a bot field value by ID.",
    inputSchema: updateBotFieldInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput = updateBotFieldInputSchema.parse(input)
        const result = await updateBotField(api, validatedInput)

        return {
          content: [
            {
              type: "text" as const,
              text: `Bot field updated successfully:\n${formatResult(result)}`,
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
              text: `Failed to update bot field: ${message}`,
            },
          ],
        }
      }
    },
  },
  delete_bot_field: {
    description: "Delete a bot field by ID.",
    inputSchema: deleteBotFieldInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput = deleteBotFieldInputSchema.parse(input)
        const result = await deleteBotField(api, validatedInput)

        return {
          content: [
            {
              type: "text" as const,
              text: `Bot field deleted successfully:\n${formatResult(result)}`,
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
              text: `Failed to delete bot field: ${message}`,
            },
          ],
        }
      }
    },
  },
}
