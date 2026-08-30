import { workspaceContract } from "@chatbotx.io/api-contract/workspace"
import { implement, onError } from "@orpc/server"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import type { BaseContext } from "@/orpc"
import { logAndMapKnownOrpcErrors } from "@/orpc"

const os = implement(workspaceContract)
  .$context<BaseContext>()
  .use(onError(logAndMapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)

export const workspaceWorkspaceTokenAPIs = {
  getWorkspaceWorkspaceTokenAPI: os.getWorkspaceContract.handler(
    ({ context }) => context.workspace,
  ),
}

export default workspaceWorkspaceTokenAPIs
