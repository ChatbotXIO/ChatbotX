import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listChatbotMembers } from "../queries"
import {
  listChatbotMembersRequest,
  listChatbotMembersResponse,
} from "../schema/query"

export const chatbotMembersAuthenticatedAPI = {
  listChatbotMembersAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/members",
      summary: "List chatbot members",
      tags: ["Chatbot Members"],
    })
    .input(listChatbotMembersRequest)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .output(listChatbotMembersResponse)
    .handler(async ({ input }) => {
      return await listChatbotMembers(input)
    }),
}
