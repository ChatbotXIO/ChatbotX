import { type ChatbotXAPI, listFlows } from "@chatbotx/public-apis"
import { formatResult } from "../utils"

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : "Unknown error"
}

export default {
  list_flows: {
    description: "Get a list of all flows in the system.",
    execute: async (api: ChatbotXAPI) => {
      try {
        const result = await listFlows(api)

        return {
          content: [
            {
              type: "text" as const,
              text: `Flow list:\n${formatResult(result)}`,
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
              text: `Failed to fetch flow list: ${message}`,
            },
          ],
        }
      }
    },
  },
}
