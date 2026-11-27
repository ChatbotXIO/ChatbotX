import {
  type ChannelPostComment,
  decodePostCommentCursor,
  encodePostCommentCursor,
  type PostHandlers,
} from "@chatbotx.io/sdk"
import { z } from "zod"
import { type FacebookPostComment, listPostComments } from "../apis/comment"
import { getLiveState, readLiveBroadcast } from "../apis/live-video"
import { getManagedPost, getPostsMetrics, listPagePosts } from "../apis/post"
import type { MessengerAuthValue } from "../schema"

const messengerCursorSchema = z.object({ after: z.string().min(1) })

const toChannelPostComment = (
  comment: FacebookPostComment,
  pageId: string,
): ChannelPostComment => ({
  author: { id: comment.from?.id ?? null, name: comment.from?.name ?? null },
  createdAt: new Date(comment.created_time),
  fromOwner: comment.from?.id ? comment.from.id === pageId : null,
  hidden: comment.is_hidden ?? null,
  id: comment.id,
  parentId: comment.parent?.id ?? null,
  text: comment.message ?? "",
})

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
  listComments: async ({ ctx, data }) => {
    const page = await listPostComments({
      auth: ctx.auth,
      postId: data.postId,
      after: data.cursor
        ? decodePostCommentCursor(data.cursor, messengerCursorSchema).after
        : undefined,
    })
    return {
      items: page.comments.map((comment) =>
        toChannelPostComment(comment, ctx.auth.metadata.pageId),
      ),
      nextCursor: page.nextCursor
        ? encodePostCommentCursor({ after: page.nextCursor })
        : null,
      pauseMs: page.pauseMs,
    }
  },
}
