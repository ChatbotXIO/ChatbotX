import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceTokenAuthAPI } from "@/orpc"
import { listSavedReplies } from "../queries"
import { listSavedReplyResponse } from "../schema/mutation"

export const savedReplyWorkspaceTokenAPIs = {
  listSavedRepliesWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/saved-replies",
      summary: "List saved replies",
      tags: ["Saved Replies"],
    })
    .input(
      z.object({
        userId: zodBigintAsString(),
      }),
    )
    .output(listSavedReplyResponse)
    .handler(async ({ input }) => {
      return await listSavedReplies({ userId: input.userId })
    }),
}

export default savedReplyWorkspaceTokenAPIs
