import type { PostHandlers } from "@chatbotx.io/sdk"
import { getLiveState, readLiveBroadcast } from "../apis/live-video"
import { getManagedPost, getPostsMetrics, listPagePosts } from "../apis/post"
import type { MessengerAuthValue } from "../schema"

export const postHandlers: PostHandlers<MessengerAuthValue> = {
  listPosts: async ({ ctx, data }) =>
    await listPagePosts({
      auth: ctx.auth,
      cursor: data.cursor,
      limit: data.limit,
    }),
  getPost: async ({ ctx, data }) =>
    await getManagedPost({ auth: ctx.auth, postId: data.postId }),
  getPostsMetrics: async ({ ctx, data }) =>
    await getPostsMetrics({ auth: ctx.auth, postIds: data.postIds }),
  getLiveState: async ({ ctx, data }) =>
    await getLiveState({ auth: ctx.auth, postId: data.postId }),
  readLiveBroadcast: async ({ ctx, data }) =>
    await readLiveBroadcast({ auth: ctx.auth, liveVideoId: data.liveVideoId }),
}
