import { aiAgentService } from "@chatbotx.io/business"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

import { listAIAgentsResponse } from "../schema/query"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

const listAIAgentsWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/ai-agents",
    summary: "List AI agents",
    tags: ["AI Agents"],
  })
  .output(listAIAgentsResponse)
  .handler(
    async ({ context }) =>
      await aiAgentService.listAIAgents({
        workspaceId: context.workspace.id,
        page: 1,
        perPage: 100,
        sort: [{ id: "createdAt", desc: true }],
      }),
  )

export const aiAgentsWorkspaceTokenAPIs = {
  listAIAgentsWorkspaceTokenAPI,
}

export default aiAgentsWorkspaceTokenAPIs
