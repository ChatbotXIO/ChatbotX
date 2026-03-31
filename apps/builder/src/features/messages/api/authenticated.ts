import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { findMessage, listMessages } from "../queries"
import {
  findMessageRequest,
  listMessagesRequest,
  listMessagesResponse,
} from "../schema/query"
import { messageResource } from "../schema/resource"

export const messagesAuthenticatedAPI = {
  listMessagesAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/messages",
      summary: "List messages",
      tags: ["Messages"],
    })
    .input(listMessagesRequest)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .output(listMessagesResponse)
    .handler(async ({ input }) => {
      return await listMessages(input)
    }),

  findMessageAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/messages/{messageId}",
      summary: "Find message by message id",
      tags: ["Messages"],
    })
    .input(findMessageRequest)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .output(messageResource)
    .handler(async ({ input }) => {
      return await findMessage(input)
    }),
}
