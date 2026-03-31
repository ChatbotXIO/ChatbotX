import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  findConversation,
  listConversations,
} from "../queries/list-conversations.query"
import { listConversationsRequest } from "../schema/query"
import {
  findConversationRequest,
  findConversationResponse,
  listConversationsResponse,
} from "../schema/resource"

export const conversationsAuthenticatedAPI = {
  listConversationsAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/chatbots/{chatbotId}/conversations",
      summary: "List conversations by cursor pagination",
      tags: ["Conversations"],
    })
    .input(listConversationsRequest)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .output(listConversationsResponse)
    .handler(async ({ input }) => {
      return await listConversations(input)
    }),

  listConversationsByPOSTAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/chatbots/{chatbotId}/conversations/list",
      summary: "List conversations by cursor pagination using POST request",
      tags: ["Conversations"],
    })
    .input(listConversationsRequest)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .output(listConversationsResponse)
    .handler(async ({ input }) => {
      return await listConversations(input)
    }),

  findConversationAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/conversations/{conversationId}",
      summary: "Find conversation by conversation id",
      tags: ["Conversations"],
    })
    .input(findConversationRequest)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .output(findConversationResponse)
    .handler(async ({ input }) => {
      return await findConversation(input)
    }),
}
