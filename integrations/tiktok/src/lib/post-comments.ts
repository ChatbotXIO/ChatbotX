import {
  type ChannelPostComment,
  type ChannelPostCommentPage,
  decodePostCommentCursor,
  encodePostCommentCursor,
} from "@chatbotx.io/sdk"
import { z } from "zod"
import { listTiktokCommentReplies, listTiktokComments } from "../apis/comment"
import type { TiktokAuthValue, TiktokComment } from "../schema"

/** The documented maximum of `max_count` on both comment list endpoints. */
const COMMENTS_PAGE_SIZE = 30

/** The documented maximum of replies nested in a comment by `include_replies`. */
const NESTED_REPLIES_MAX = 3

/**
 * TikTok's "Get comments on an owned video" (/business/comment/list/): "If the
 * number of comments on the owned video exceeds 500, the first 500 comments
 * will be returned according to the specified sorting, and the remaining
 * comments will be returned in reverse order based on the number of likes.
 * Also, the comments beyond the first 500 and the first 500 comments
 * themselves are not deduplicated and may contain duplicates." So the ids of
 * the first 500 top-level comments are kept in the cursor, and a later
 * top-level comment with one of them is skipped (no row, no replies read).
 */
export const TIKTOK_COMMENT_DEDUPE_WINDOW = 500

const pendingRepliesSchema = z.object({
  parentId: z.string().min(1),
  after: z.number().int().min(0),
})

/**
 * Where a traversal stands: the cursor of the next top-level page (`null` when
 * that edge is read to the end) and the comments whose replies are read on the
 * replies edge, in order, before the traversal moves on.
 */
const traversalCursorSchema = z.object({
  top: z.number().int().min(0).nullable(),
  pending: z.array(pendingRepliesSchema),
  /** Ids of the first top-level comments seen (a cursor made before this field has none). */
  seen: z
    .array(z.string().min(1))
    .max(TIKTOK_COMMENT_DEDUPE_WINDOW)
    .default([]),
})
type TraversalCursor = z.infer<typeof traversalCursorSchema>

type CommentList = { comments: TiktokComment[]; next: number | null }

const toHidden = (status: TiktokComment["status"]): boolean | null => {
  if (status === "HIDDEN") {
    return true
  }
  return status === "PUBLIC" ? false : null
}

/**
 * The parent comes from where the comment was read, never from
 * `parent_comment_id`: the webhook sends `0` there on a top-level comment and
 * the list response is unverified.
 */
const toChannelPostComment = (
  comment: TiktokComment,
  parentId: string | null,
): ChannelPostComment => ({
  author: {
    id: comment.unique_identifier ?? comment.user_id ?? null,
    name: comment.display_name ?? comment.username ?? null,
  },
  createdAt:
    comment.create_time === undefined
      ? null
      : new Date(comment.create_time * 1000),
  fromOwner: comment.owner ?? null,
  hidden: toHidden(comment.status),
  id: comment.comment_id,
  parentId,
  text: comment.text ?? "",
})

const nextCursor = (state: TraversalCursor): string | null =>
  state.top === null && state.pending.length === 0
    ? null
    : encodePostCommentCursor(state)

const toCommentList = (result: {
  comments?: TiktokComment[]
  cursor?: number
  has_more?: boolean
}): CommentList => ({
  comments: result.comments ?? [],
  next: result.has_more && result.cursor !== undefined ? result.cursor : null,
})

/**
 * `reply_list` carries at most {@link NESTED_REPLIES_MAX} replies per comment.
 * When the comment's `replies` count says they are all there, they are taken
 * from the nested list; otherwise its replies edge is read from the start, so
 * none is read twice or missed. A missing count is complete only while the
 * nested list is short of the maximum (a full list may be truncated).
 */
const hasCompleteNestedReplies = (comment: TiktokComment): boolean => {
  const nested = comment.reply_list?.length ?? 0
  return comment.replies === undefined
    ? nested < NESTED_REPLIES_MAX
    : comment.replies <= nested
}

const readRepliesPage = async (props: {
  auth: TiktokAuthValue
  postId: string
  state: TraversalCursor
}): Promise<ChannelPostCommentPage> => {
  const { auth, postId, state } = props
  const [current, ...rest] = state.pending
  const { comments, next } = toCommentList(
    await listTiktokCommentReplies(auth.tokens.accessToken, {
      businessId: auth.metadata.openId,
      videoId: postId,
      commentId: current.parentId,
      status: "ALL",
      cursor: current.after,
      maxCount: COMMENTS_PAGE_SIZE,
    }),
  )
  const pending =
    next === null
      ? rest
      : [{ parentId: current.parentId, after: next }, ...rest]
  return {
    items: comments.map((reply) =>
      toChannelPostComment(reply, current.parentId),
    ),
    nextCursor: nextCursor({ ...state, pending }),
  }
}

const readTopLevelPage = async (props: {
  auth: TiktokAuthValue
  postId: string
  seen: string[]
  top: number | null
}): Promise<ChannelPostCommentPage> => {
  const { auth, postId, seen, top } = props
  const { comments, next } = toCommentList(
    await listTiktokComments(auth.tokens.accessToken, {
      businessId: auth.metadata.openId,
      videoId: postId,
      includeReplies: true,
      status: "ALL",
      cursor: top ?? undefined,
      maxCount: COMMENTS_PAGE_SIZE,
    }),
  )
  const seenIds = new Set(seen)
  const fresh = comments.filter((comment) => {
    if (seenIds.has(comment.comment_id)) {
      return false
    }
    if (seenIds.size < TIKTOK_COMMENT_DEDUPE_WINDOW) {
      seenIds.add(comment.comment_id)
    }
    return true
  })
  const items = fresh.flatMap((comment) => [
    toChannelPostComment(comment, null),
    ...(hasCompleteNestedReplies(comment)
      ? (comment.reply_list ?? [])
      : []
    ).map((reply) => toChannelPostComment(reply, comment.comment_id)),
  ])
  const pending = fresh
    .filter((comment) => !hasCompleteNestedReplies(comment))
    .map((comment) => ({ parentId: comment.comment_id, after: 0 }))
  return {
    items,
    nextCursor: nextCursor({ pending, seen: [...seenIds], top: next }),
  }
}

/**
 * One step of a complete traversal of a video's comments and replies, one API
 * request per call. Runs inside the channel handler, so the SDK's
 * `runChannelHandler` refreshes an expiring token first and retries once on a
 * `TiktokAuthException`, the same as every other handler of this channel.
 */
export const listVideoComments = (props: {
  auth: TiktokAuthValue
  cursor?: string
  postId: string
}): Promise<ChannelPostCommentPage> => {
  const { auth, cursor, postId } = props
  const state = cursor
    ? decodePostCommentCursor(cursor, traversalCursorSchema)
    : undefined
  if (state && state.pending.length > 0) {
    return readRepliesPage({ auth, postId, state })
  }
  return readTopLevelPage({
    auth,
    postId,
    seen: state?.seen ?? [],
    top: state?.top ?? null,
  })
}
