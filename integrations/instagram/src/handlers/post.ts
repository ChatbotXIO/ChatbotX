import type { PostHandlers } from "@chatbotx.io/sdk"
import { getManagedMedia, listManagedMedia } from "../apis/post"
import type { InstagramAuthValue } from "../schema"

export const postHandlers: PostHandlers<InstagramAuthValue> = {
  listPosts: async ({ ctx, data }) =>
    await listManagedMedia({
      auth: ctx.auth,
      cursor: data.cursor,
      limit: data.limit,
    }),
  getPost: async ({ ctx, data }) =>
    await getManagedMedia({ auth: ctx.auth, postId: data.postId }),
}
