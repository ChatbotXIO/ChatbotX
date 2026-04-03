import { chatbotTokenAPI } from "@/orpc"
import { listErrorLogs } from "../queries"
import {
  listErrorLogsRequest,
  publicListErrorLogsResponse,
} from "../schemas/query"

export const chatbotTokenErrorLogsAPIs = {
  listErrorLogsChatbotTokenAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/v1/error-logs",
      summary: "List error logs",
      tags: ["Error Logs"],
    })
    .input(listErrorLogsRequest)
    .output(publicListErrorLogsResponse)
    .handler(async ({ context, input }) => {
      return await listErrorLogs({
        ...input,
        chatbotId: context.chatbot.id,
      })
    }),
}

export default chatbotTokenErrorLogsAPIs
