import { type ChatbotXAPI, listBroadcasts } from "@chatbotx/public-apis"
import { formatResult } from "../utils"

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : "Unknown error"
}

export default {
  list_broadcasts: {
    description: "Get a list of all broadcasts in the system.",
    execute: async (api: ChatbotXAPI) => {
      try {
        const result = await listBroadcasts(api)

        return {
          content: [
            {
              type: "text" as const,
              text: `Broadcast list:\n${formatResult(result)}`,
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
              text: `Failed to fetch broadcast list: ${message}`,
            },
          ],
        }
      }
    },
  },
}
