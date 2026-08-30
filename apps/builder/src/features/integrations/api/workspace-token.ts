import { integrationContract } from "@chatbotx.io/api-contract/integration"
import { integrationService } from "@chatbotx.io/business"
import { implement, onError } from "@orpc/server"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import type { BaseContext } from "@/orpc"
import { logAndMapKnownOrpcErrors } from "@/orpc"

const os = implement(integrationContract)
  .$context<BaseContext>()
  .use(onError(logAndMapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)

const listIntegrationsWorkspaceTokenAPI = os.listIntegrationsContract.handler(
  async ({ context }) => {
    const data = await integrationService.listByWorkspaceId(
      context.workspace.id,
    )
    return { data }
  },
)

export const integrationsWorkspaceTokenAPIs = {
  listIntegrationsWorkspaceTokenAPI,
}

export default integrationsWorkspaceTokenAPIs
