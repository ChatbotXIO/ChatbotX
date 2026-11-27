import {
  type ChannelPostComment,
  decodePostCommentCursor,
  encodePostCommentCursor,
  type PostHandlers,
} from "@chatbotx.io/sdk"
import { z } from "zod"
import {
  listPostConversation,
  type ThreadsConversationReply,
} from "../apis/comment"
import { getManagedPost, listManagedPosts } from "../apis/post"
import type { ThreadsAuthValue } from "../schema"

/**
 * `hide_status` values the Threads reference documents. Hidden by the owner
 * (`HIDDEN`) or by Threads (`COVERED`) means not shown; `NOT_HUSHED` and
 * `UNHUSHED` mean shown. Anything else (`BLOCKED`, `RESTRICTED`, a new value)
 * is unknown, not a guess.
 */
const HIDDEN_BY_STATUS: Readonly<Record<string, boolean>> = {
  COVERED: true,
  HIDDEN: true,
  NOT_HUSHED: false,
  UNHUSHED: false,
}

const threadsCursorSchema = z.object({ after: z.string().min(1) })

/**
 * `replied_to` names the immediate parent; on a direct reply that is the post
 * itself, which is not a comment, so it maps to a top-level comment.
 */
const toChannelPostComment = (
  reply: ThreadsConversationReply,
  postId: string,
): ChannelPostComment => ({
  author: { id: null, name: reply.username ?? null },
  createdAt: new Date(reply.timestamp),
  fromOwner: reply.is_reply_owned_by_me ?? null,
  hidden: HIDDEN_BY_STATUS[reply.hide_status ?? ""] ?? null,
  id: reply.id,
  parentId:
    reply.replied_to?.id === postId ? null : (reply.replied_to?.id ?? null),
  text: reply.text ?? "",
})

export const postHandlers: PostHandlers<ThreadsAuthValue> = {
  listPosts: async ({ ctx, data }) =>
    await listManagedPosts({
      auth: ctx.auth,
      cursor: data.cursor,
      limit: data.limit,
    }),
  getPost: async ({ ctx, data }) =>
    await getManagedPost({ auth: ctx.auth, postId: data.postId }),
  listComments: async ({ ctx, data }) => {
    const page = await listPostConversation({
      auth: ctx.auth,
      postId: data.postId,
      after: data.cursor
        ? decodePostCommentCursor(data.cursor, threadsCursorSchema).after
        : undefined,
    })
    return {
      items: page.replies.map((reply) =>
        toChannelPostComment(reply, data.postId),
      ),
      nextCursor: page.nextCursor
        ? encodePostCommentCursor({ after: page.nextCursor })
        : null,
    }
  },
}
