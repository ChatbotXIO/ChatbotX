import type { PostHandlers } from "@chatbotx.io/sdk"
import { getLiveState } from "../apis/live"
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
  getLiveState: async ({ ctx, data }) =>
    await getLiveState({ auth: ctx.auth, postId: data.postId }),
}
