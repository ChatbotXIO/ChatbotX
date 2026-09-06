import { aiAgentService } from "@chatbotx.io/business"
import { publicListRequest } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listAIAgentsResponse } from "../schema/query"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const aiAgentsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ai-agents",
      summary: "List AI agents",
      tags: ["AI Agents"],
    })
    .input(publicListRequest)
    .output(listAIAgentsResponse)
    .handler(
      async ({ context, input }) =>
        await aiAgentService.listAIAgents({
          workspaceId: context.workspace.id,
          ...input,
          sort: [{ id: "createdAt", desc: true }],
        }),
    ),
}
