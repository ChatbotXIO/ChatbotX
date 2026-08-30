import { aiAgentContract } from "@chatbotx.io/api-contract/ai-agent"
import { aiAgentService } from "@chatbotx.io/business"
import { implement, onError } from "@orpc/server"
import type { BaseContext } from "@/middlewares/context"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import { mapKnownOrpcErrors, requireTokenScope } from "@/orpc"

const os = implement(aiAgentContract)
  .$context<BaseContext>()
  .use(onError(mapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)
  .use(requireTokenScope("automation"))

const listAIAgentsWorkspaceTokenAPI = os.listAiAgentsContract.handler(
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
