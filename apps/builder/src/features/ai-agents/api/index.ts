import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listAIAgents } from "../queries"
import { listAIAgentsRequest, listAIAgentsResponse } from "../schemas/query"

const listAIAgentsAPI = authorizedAPI
  .route({
    method: "GET",
    path: "/workspaces/{workspaceId}/ai-agents",
    summary: "List AI agents",
    tags: ["AI"],
  })
  .input(listAIAgentsRequest.and(withWorkspaceIdSchema))
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .output(listAIAgentsResponse)
  .handler(async ({ input }) => {
    return await listAIAgents(input)
  })

const aiAgentsAPI = {
  listAIAgentsAPI,
}

export default aiAgentsAPI
