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
      tags: ["Flows", "Private APIs"],
    })
    .input(listFlowsRequest.and(withChatbotIdSchema))
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .output(listFlowsResponse)
    .handler(async ({ context, input }) => {
      return await listFlows({ ...input, chatbotId: context.chatbot.id })
    }),
}

export default privateFlowsAPI
