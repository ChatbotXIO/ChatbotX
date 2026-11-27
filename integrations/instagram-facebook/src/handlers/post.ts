import { collectMediaMetrics } from "@chatbotx.io/integration-instagram/apis/post"
import { listMediaPostComments } from "@chatbotx.io/integration-instagram/apis/post-comments"
import type { PostHandlers } from "@chatbotx.io/sdk"
import { listMediaCommentReplies, listMediaComments } from "../apis/comment"
import { getLiveState } from "../apis/live"
import { getManagedMedia, listManagedMedia } from "../apis/post"
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
  getLiveState: async ({ ctx, data }) =>
    await getLiveState({ auth: ctx.auth, postId: data.postId }),
  getPostsMetrics: async ({ ctx, data }) =>
    await collectMediaMetrics({
      postIds: data.postIds,
      readOne: (postId) => getManagedMedia({ auth: ctx.auth, postId }),
      toChannelError: mapToChannelError,
    }),
  listComments: async ({ ctx, data }) =>
    await listMediaPostComments({
      cursor: data.cursor,
      ownerId: ctx.auth.metadata.igId,
      readers: {
        readTopLevel: (after) =>
          listMediaComments({
            auth: ctx.auth,
            mediaId: data.postId,
            after,
          }),
        readReplies: ({ commentId, after }) =>
          listMediaCommentReplies({ auth: ctx.auth, commentId, after }),
      },
    }),
}
