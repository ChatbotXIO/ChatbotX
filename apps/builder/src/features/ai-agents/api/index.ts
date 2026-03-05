import z from "zod"
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
  .input(
    z
      .object({
        chatbotId: z.string(),
      })
      .and(listAIAgentsRequest),
  )
  .output(listAIAgentsResponse)
  .handler(async ({ input }) => {
    return await listAIAgents(input)
  })

const aiAgentsAPI = {
  listAIAgentsAPI,
}

export default aiAgentsAPI
