import { savedReplyContract } from "@chatbotx.io/api-contract/saved-reply"
import { implement, onError } from "@orpc/server"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import type { BaseContext } from "@/orpc"
import { logAndMapKnownOrpcErrors } from "@/orpc"
import { listSavedReplies } from "../queries"

const os = implement(savedReplyContract)
  .$context<BaseContext>()
  .use(onError(logAndMapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)

export const savedReplyWorkspaceTokenAPIs = {
  listSavedRepliesWorkspaceTokenAPI: os.listSavedRepliesContract.handler(
    async ({ context }) =>
      await listSavedReplies({ workspaceId: context.workspace.id }),
  ),
}

export default savedReplyWorkspaceTokenAPIs
