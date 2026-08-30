import { flowContract } from "@chatbotx.io/api-contract/flow"
import { implement, onError } from "@orpc/server"
import type { BaseContext } from "@/middlewares/context"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import { mapKnownOrpcErrors, requireTokenScope } from "@/orpc"
import { listFlows } from "../queries"

const os = implement(flowContract)
  .$context<BaseContext>()
  .use(onError(mapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)
  .use(requireTokenScope("automation"))

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
