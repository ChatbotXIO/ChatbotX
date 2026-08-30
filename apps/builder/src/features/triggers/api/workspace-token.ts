import { triggerContract } from "@chatbotx.io/api-contract/trigger"
import { triggerService } from "@chatbotx.io/business"
import { implement, onError } from "@orpc/server"
import type { BaseContext } from "@/middlewares/context"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import { mapKnownOrpcErrors, requireTokenScope } from "@/orpc"

const os = implement(triggerContract)
  .$context<BaseContext>()
  .use(onError(mapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)
  .use(requireTokenScope("automation"))

const listTriggersWorkspaceTokenAPI = os.listTriggersContract.handler(
  async ({ context }) => {
    const triggers = await triggerService.listByWorkspaceId(
      context.workspace.id,
    )
    return {
      data: triggers.map((trigger) => ({
        ...trigger,
        conditions: [],
        actions: [],
      })),
    }
  },
)

export const triggersWorkspaceTokenAPIs = {
  listTriggersWorkspaceTokenAPI,
}

export default triggersWorkspaceTokenAPIs
