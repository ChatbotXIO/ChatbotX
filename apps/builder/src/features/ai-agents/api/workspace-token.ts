import { aiAgentContract } from "@chatbotx.io/api-contract/ai-agent"
import { aiAgentService } from "@chatbotx.io/business"
import { implement, onError } from "@orpc/server"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import type { BaseContext } from "@/orpc"
import { logAndMapKnownOrpcErrors } from "@/orpc"

const os = implement(aiAgentContract)
  .$context<BaseContext>()
  .use(onError(logAndMapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)

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
