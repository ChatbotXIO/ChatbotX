import {
  type ChatbotXAPI,
  deleteBotField,
  getBotField,
  updateBotField,
} from "@chatbotx/public-apis"
import { formatResult } from "../utils"

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : "Unknown error"
}

export default {
  get_bot_field: {
    description: "Get a bot field by its ID.",
    execute: async (
      api: ChatbotXAPI,
      input: Parameters<typeof getBotField>[1],
    ) => {
      try {
        const result = await getBotField(api, input)

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
    execute: async (
      api: ChatbotXAPI,
      input: Parameters<typeof updateBotField>[1],
    ) => {
      try {
        const result = await updateBotField(api, input)

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
    execute: async (
      api: ChatbotXAPI,
      input: Parameters<typeof deleteBotField>[1],
    ) => {
      try {
        const result = await deleteBotField(api, input)

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
