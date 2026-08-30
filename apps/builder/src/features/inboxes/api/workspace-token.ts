import { inboxContract } from "@chatbotx.io/api-contract/inbox"
import { implement, onError } from "@orpc/server"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import type { BaseContext } from "@/orpc"
import { logAndMapKnownOrpcErrors } from "@/orpc"
import { listInboxes } from "../queries"

const os = implement(inboxContract)
  .$context<BaseContext>()
  .use(onError(logAndMapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)

export const inboxesWorkspaceTokenAPIs = {
  listInboxesWorkspaceTokenAPI: os.listInboxesContract.handler(
    async ({ context, input }) =>
      await listInboxes({
        ...input,
        workspaceId: context.workspace.id,
      }),
  ),

  listChannelsWorkspaceTokenAPI: os.listChannelsContract.handler(
    async ({ context, input }) => {
      const result = await listInboxes({
        ...input,
        workspaceId: context.workspace.id,
      })
      return {
        ...result,
        data: result.data.map(({ sourceId, ...inbox }) => ({
          ...inbox,
          id: sourceId,
        })),
      }
    },
  ),
}

export default inboxesWorkspaceTokenAPIs
