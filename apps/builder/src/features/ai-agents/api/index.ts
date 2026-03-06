import { withChatbotIdSchema } from "@/features/chatbots/schemas/resource"
import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listAIAgents } from "../queries"
import { listAIAgentsRequest, listAIAgentsResponse } from "../schemas/query"

const listAIAgentsAPI = authorizedAPI
  .route({
    method: "GET",
    path: "/chatbots/{chatbotId}/ai-agents",
    summary: "List AI agents",
    tags: ["AI"],
  })
  .input(listAIAgentsRequest.and(withChatbotIdSchema))
  .use(chatbotAuthMiddleware, (input) => input.chatbotId)
  .output(listAIAgentsResponse)
  .handler(async ({ input }) => {
    return await listAIAgents(input)
  })

const aiAgentsAPI = {
  listAIAgentsAPI,
}

export default aiAgentsAPI
