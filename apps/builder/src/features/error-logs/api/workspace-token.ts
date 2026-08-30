import { errorLogContract } from "@chatbotx.io/api-contract/error-log"
import { implement, onError } from "@orpc/server"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import type { BaseContext } from "@/orpc"
import { logAndMapKnownOrpcErrors } from "@/orpc"
import { listErrorLogs } from "../queries"

const os = implement(errorLogContract)
  .$context<BaseContext>()
  .use(onError(logAndMapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)

export const errorLogsWorkspaceTokenAPIs = {
  listErrorLogsWorkspaceTokenAPI: os.listErrorLogsContract.handler(
    async ({ context, input }) =>
      await listErrorLogs({
        ...input,
        workspaceId: context.workspace.id,
      }),
  ),
}

export default errorLogsWorkspaceTokenAPIs
