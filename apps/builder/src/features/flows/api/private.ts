import { withChatbotIdSchema } from "@/features/chatbots/schemas/resource"
import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listFlows } from "../queries"
import { listFlowsRequest, listFlowsResponse } from "../schemas/query"

export const privateFlowsAPI = {
  privateListFlowsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/flows",
      summary: "List flows",
      tags: ["Flows"],
    })
    .input(listFlowsRequest.and(withChatbotIdSchema))
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .output(listFlowsResponse)
    .handler(async ({ input }) => {
      const { chatbotId, ...rest } = input
      return await listFlows({ ...rest, chatbotId })
    }),
}

export default privateFlowsAPI
