import { integrationContract } from "@chatbotx.io/api-contract/integration"
import { integrationService } from "@chatbotx.io/business"
import { implement, onError } from "@orpc/server"
import type { BaseContext } from "@/middlewares/context"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import { mapKnownOrpcErrors, requireTokenScope } from "@/orpc"

const os = implement(integrationContract)
  .$context<BaseContext>()
  .use(onError(mapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)
  .use(requireTokenScope("integrations"))

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
