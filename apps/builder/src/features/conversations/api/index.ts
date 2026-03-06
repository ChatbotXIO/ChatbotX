import z from "zod"
import { listAIAgentsRequest } from "@/features/ai-agents/schemas/query"
import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listConversations } from "../queries/list-conversations.query"
import { listConversationsResponse } from "../schemas/resource"

const listConversationsApi = authorizedAPI
  .route({
    method: "POST",
    path: "/chatbots/{chatbotId}/conversations/list",
    summary: "List conversations by cursor pagination",
    tags: ["Conversations"],
  })
  .input(
    listAIAgentsRequest.and(
      z.object({
        chatbotId: z.cuid2(),
      }),
    ),
  )
  .use(chatbotAuthMiddleware, (input) => input.chatbotId)
  .output(listConversationsResponse)
  .handler(async ({ input }) => {
    const { chatbotId, ...rest } = input

    return await listConversations(chatbotId, rest)
  })

const conversationsAPI = {
  listConversationsApi,
}

export default conversationsAPI
