import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listSavedReplies } from "../queries"
import {
  listSavedRepliesRequest,
  listSavedReplyResponse,
} from "../schema/mutation"

export const savedRepliesAuthorizedAPI = {
  listSavedRepliesAuthorizedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/saved-replies",
      summary: "List saved replies",
      tags: ["Saved Replies"],
    })
    .input(listSavedRepliesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listSavedReplyResponse)
    .handler(async ({ input }) => {
      return await listSavedReplies({ workspaceId: input.workspaceId })
    }),
}
