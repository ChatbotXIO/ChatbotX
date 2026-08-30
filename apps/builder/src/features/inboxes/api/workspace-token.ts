import { inboxContract } from "@chatbotx.io/api-contract/inbox"
import { implement, onError } from "@orpc/server"
import type { BaseContext } from "@/middlewares/context"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import { mapKnownOrpcErrors, requireTokenScope } from "@/orpc"
import { listInboxes } from "../queries"

const os = implement(inboxContract)
  .$context<BaseContext>()
  .use(onError(mapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)
  .use(requireTokenScope("inbox"))

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
