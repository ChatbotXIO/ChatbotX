import { chatbotTokenAPI } from "@/orpc"
import { listFlows } from "../queries"
import { listFlowsRequest, listFlowsResponse } from "../schemas/query"

const publicFlowsAPI = {
  publicListFlowsAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/public/chatbots/flows",
      summary: "List flows",
      tags: ["Flows", "Public APIs"],
    })
    .input(listFlowsRequest)
    .output(listFlowsResponse)
    .handler(async ({ context, input }) => {
      return await listFlows({ ...input, chatbotId: context.chatbot.id })
    }),
}

export default publicFlowsAPI
