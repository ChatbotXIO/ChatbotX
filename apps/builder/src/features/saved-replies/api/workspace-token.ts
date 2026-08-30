import { savedReplyContract } from "@chatbotx.io/api-contract/saved-reply"
import { implement, onError } from "@orpc/server"
import type { BaseContext } from "@/middlewares/context"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import { mapKnownOrpcErrors, requireTokenScope } from "@/orpc"
import { listSavedReplies } from "../queries"

const os = implement(savedReplyContract)
  .$context<BaseContext>()
  .use(onError(mapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)
  .use(requireTokenScope("inbox"))

export const savedReplyWorkspaceTokenAPIs = {
  listSavedRepliesWorkspaceTokenAPI: os.listSavedRepliesContract.handler(
    async ({ context }) =>
      await listSavedReplies({ workspaceId: context.workspace.id }),
  ),
}

export default savedReplyWorkspaceTokenAPIs
