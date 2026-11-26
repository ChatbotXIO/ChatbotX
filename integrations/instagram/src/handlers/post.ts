import type { PostHandlers } from "@chatbotx.io/sdk"
import {
  collectMediaMetrics,
  getManagedMedia,
  listManagedMedia,
} from "../apis/post"
import { mapToChannelError } from "../lib/error-mapper"
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
  getPostsMetrics: async ({ ctx, data }) =>
    await collectMediaMetrics({
      postIds: data.postIds,
      readOne: (postId) => getManagedMedia({ auth: ctx.auth, postId }),
      toChannelError: mapToChannelError,
    }),
}
