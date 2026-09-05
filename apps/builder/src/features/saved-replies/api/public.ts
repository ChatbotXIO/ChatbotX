import { paginateInMemory, publicListRequest } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listSavedReplies } from "../queries"
import { publicListSavedReplyResponse } from "../schema/mutation"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")

export const savedRepliesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/saved-replies",
      summary: "List saved replies",
      tags: ["Saved Replies"],
    })
    .input(publicListRequest)
    .output(publicListSavedReplyResponse)
    .handler(async ({ context, input }) => {
      const { data } = await listSavedReplies({
        workspaceId: context.workspace.id,
      })
      return paginateInMemory(data, input)
    }),
}
