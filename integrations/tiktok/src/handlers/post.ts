import type { PostHandlers } from "@chatbotx.io/sdk"
import { getManagedVideo, listManagedVideos } from "../apis/video"
import { listVideoComments } from "../lib/post-comments"
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
  listComments: async ({ ctx, data }) =>
    await listVideoComments({
      auth: ctx.auth,
      cursor: data.cursor,
      postId: data.postId,
    }),
}
