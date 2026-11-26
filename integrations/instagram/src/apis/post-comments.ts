import {
  type ChannelPostComment,
  type ChannelPostCommentPage,
  decodePostCommentCursor,
  encodePostCommentCursor,
} from "@chatbotx.io/sdk"
import { z } from "zod"
import type {
  InstagramCommentRepliesPage,
  InstagramMediaComment,
  InstagramMediaCommentPage,
} from "./comment"

/** A comment whose replies still have pages to read after the top-level page. */
const pendingRepliesSchema = z.object({
  parentId: z.string().min(1),
  after: z.string().min(1),
})

/**
 * Where a traversal stands: the cursor of the next top-level page (`null` when
 * that edge is read to the end) and the comments whose replies are still being
 * paged, followed in order before the traversal moves on.
 */
const traversalCursorSchema = z.object({
  top: z.string().min(1).nullable(),
  pending: z.array(pendingRepliesSchema),
})
type TraversalCursor = z.infer<typeof traversalCursorSchema>
type PendingReplies = z.infer<typeof pendingRepliesSchema>

type MediaCommentFields = Omit<InstagramMediaComment, "replies">

type MediaCommentReaders = {
  readTopLevel: (after?: string) => Promise<InstagramMediaCommentPage>
  readReplies: (props: {
    commentId: string
    after?: string
  }) => Promise<InstagramCommentRepliesPage>
}

const toChannelPostComment = (
  comment: MediaCommentFields,
  fallbackParentId: string | null,
  ownerId: string,
): ChannelPostComment => ({
  author: {
    id: comment.from?.id ?? null,
    name: comment.from?.username ?? comment.username ?? null,
  },
  createdAt: new Date(comment.timestamp),
  fromOwner: comment.from?.id ? comment.from.id === ownerId : null,
  hidden: comment.hidden ?? null,
  id: comment.id,
  parentId: comment.parent_id ?? fallbackParentId,
  text: comment.text ?? "",
})

const nextCursor = (state: TraversalCursor): string | null =>
  state.top === null && state.pending.length === 0
    ? null
    : encodePostCommentCursor(state)

const pendingRepliesOf = (comment: InstagramMediaComment): PendingReplies[] => {
  const paging = comment.replies?.paging
  const after = paging?.next ? paging.cursors?.after : undefined
  return after ? [{ parentId: comment.id, after }] : []
}

const readRepliesPage = async (
  readers: MediaCommentReaders,
  state: TraversalCursor,
  ownerId: string,
): Promise<ChannelPostCommentPage> => {
  const [current, ...rest] = state.pending
  const page = await readers.readReplies({
    commentId: current.parentId,
    after: current.after,
  })
  const pending = page.nextCursor
    ? [{ parentId: current.parentId, after: page.nextCursor }, ...rest]
    : rest
  return {
    items: page.comments.map((reply) =>
      toChannelPostComment(reply, current.parentId, ownerId),
    ),
    nextCursor: nextCursor({ top: state.top, pending }),
    pauseMs: page.pauseMs,
  }
}

const readTopLevelPage = async (
  readers: MediaCommentReaders,
  top: string | undefined,
  ownerId: string,
): Promise<ChannelPostCommentPage> => {
  const page = await readers.readTopLevel(top)
  const items = page.comments.flatMap((comment) => [
    toChannelPostComment(comment, null, ownerId),
    ...(comment.replies?.data ?? []).map((reply) =>
      toChannelPostComment(reply, comment.id, ownerId),
    ),
  ])
  return {
    items,
    nextCursor: nextCursor({
      top: page.nextCursor ?? null,
      pending: page.comments.flatMap(pendingRepliesOf),
    }),
    pauseMs: page.pauseMs,
  }
}

/**
 * One step of a complete traversal of a media's comments and replies, one API
 * request per call. The top-level edge returns each comment with its first
 * replies nested; a comment whose replies have more pages is followed on its
 * own `replies` edge, in order, before the next top-level page is read.
 *
 * Shared by the Instagram-login and Facebook-login connectors, which differ
 * only in the client behind `readers`.
 */
export const listMediaPostComments = (props: {
  cursor?: string
  ownerId: string
  readers: MediaCommentReaders
}): Promise<ChannelPostCommentPage> => {
  const { cursor, ownerId, readers } = props
  const state = cursor
    ? decodePostCommentCursor(cursor, traversalCursorSchema)
    : undefined
  if (state && state.pending.length > 0) {
    return readRepliesPage(readers, state, ownerId)
  }
  return readTopLevelPage(readers, state?.top ?? undefined, ownerId)
}
