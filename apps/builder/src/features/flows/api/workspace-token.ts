import { flowContract } from "@chatbotx.io/api-contract/flow"
import { implement, onError } from "@orpc/server"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import type { BaseContext } from "@/orpc"
import { logAndMapKnownOrpcErrors } from "@/orpc"
import { listFlows } from "../queries"

const os = implement(flowContract)
  .$context<BaseContext>()
  .use(onError(logAndMapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)

const flowWorkspaceTokenAPIs = {
  listFlowsWorkspaceTokenAPI: os.listFlowsContract.handler(
    async ({ context, input }) =>
      await listFlows({
        ...input,
        workspaceId: context.workspace.id,
        active: true,
      }),
  ),
}

export default flowWorkspaceTokenAPIs
