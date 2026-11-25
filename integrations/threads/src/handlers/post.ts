import type { PostHandlers } from "@chatbotx.io/sdk"
import { getManagedPost, listManagedPosts } from "../apis/post"
import type { ThreadsAuthValue } from "../schema"

export const postHandlers: PostHandlers<ThreadsAuthValue> = {
  listPosts: async ({ ctx, data }) =>
    await listManagedPosts({
      auth: ctx.auth,
      cursor: data.cursor,
      limit: data.limit,
    }),
  getPost: async ({ ctx, data }) =>
    await getManagedPost({ auth: ctx.auth, postId: data.postId }),
}
