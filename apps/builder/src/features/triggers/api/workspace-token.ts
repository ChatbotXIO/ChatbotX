import { triggerContract } from "@chatbotx.io/api-contract/trigger"
import { triggerService } from "@chatbotx.io/business"
import { implement, onError } from "@orpc/server"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import type { BaseContext } from "@/orpc"
import { logAndMapKnownOrpcErrors } from "@/orpc"

const os = implement(triggerContract)
  .$context<BaseContext>()
  .use(onError(logAndMapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)

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
