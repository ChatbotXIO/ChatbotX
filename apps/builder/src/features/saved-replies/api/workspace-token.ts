import { z } from "zod"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

import { listSavedReplies } from "../queries"
import { listSavedReplyResponse } from "../schema/mutation"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")

export const savedReplyWorkspaceTokenAPIs = {
  listSavedRepliesWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/saved-replies",
      summary: "List saved replies",
      tags: ["Saved Replies"],
    })
    .input(z.object({}))
    .output(listSavedReplyResponse)
    .handler(
      async ({ context }) =>
        await listSavedReplies({ workspaceId: context.workspace.id }),
    ),
}

export default savedReplyWorkspaceTokenAPIs
