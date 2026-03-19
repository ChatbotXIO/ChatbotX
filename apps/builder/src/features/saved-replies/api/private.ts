import { authMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listSavedReplies } from "../queries"
import { listSavedReplyResponse } from "../schemas/query"

export const privateListSavedRepliesAPI = authorizedAPI
  .route({
    method: "GET",
    path: "/saved-replies",
    summary: "List saved replies",
    tags: ["Saved Replies"],
  })
  .use(authMiddleware)
  .output(listSavedReplyResponse)
  .handler(async ({ context }) => {
    return await listSavedReplies({
      userId: context.user.id,
    })
  })

const privateSavedRepliesAPI = {
  privateListSavedRepliesAPI,
}

export default privateSavedRepliesAPI
