import type { PostHandlers } from "@chatbotx.io/sdk"
import { getManagedVideo, listManagedVideos } from "../apis/video"
import type { TiktokAuthValue } from "../schema"

export const postHandlers: PostHandlers<TiktokAuthValue> = {
  listPosts: async ({ ctx, data }) =>
    await listManagedVideos({
      auth: ctx.auth,
      cursor: data.cursor,
      limit: data.limit,
    }),
  getPost: async ({ ctx, data }) =>
    await getManagedVideo({ auth: ctx.auth, postId: data.postId }),
}
