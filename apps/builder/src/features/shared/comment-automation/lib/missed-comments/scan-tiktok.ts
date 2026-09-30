import { tiktokIntegrationService } from "@chatbotx.io/business"
import type {
  TiktokAuthValue,
  TiktokComment,
} from "@chatbotx.io/integration-tiktok"
import { listTiktokComments } from "@chatbotx.io/integration-tiktok/apis/comment"
import { collectCommentsSince, toEpochSeconds } from "./paging"
import {
  MissedCommentsIntegrationNotFoundError,
  type ScanCommentsProps,
  type ScannedComment,
} from "./types"

/** `business/comment/list/` caps a page at 30. */
const TIKTOK_COMMENT_PAGE_SIZE = 30

/**
 * TikTok comments (and their replies) on the automation's video, shaped like
 * the `comment.update` webhook. Each connected account is tried until one owns
 * the video.
 */
export async function scanTiktokComments(
  props: ScanCommentsProps,
): Promise<ScannedComment[]> {
  const { workspaceId, postId, since } = props
  const integrations = await tiktokIntegrationService.listByWorkspace({
    workspaceId,
  })

  if (integrations.length === 0) {
    throw new MissedCommentsIntegrationNotFoundError()
  }

  let lastError: unknown
  for (const integration of integrations) {
    const auth = integration.auth as TiktokAuthValue
    try {
      const comments = await collectCommentsSince<TiktokComment, number>({
        fetchPage: async (cursor) => {
          const result = await listTiktokComments(auth.tokens.accessToken, {
            businessId: auth.metadata.openId,
            videoId: postId,
            includeReplies: true,
            status: "PUBLIC",
            sortField: "create_time",
            sortType: "DESC",
            cursor,
            maxCount: TIKTOK_COMMENT_PAGE_SIZE,
          })
          return {
            items: result.comments ?? [],
            nextCursor: result.has_more ? result.cursor : undefined,
          }
        },
        // A thread is kept when the comment OR any reply is recent; replies
        // are filtered on their own time below. The newest-first order is by
        // the top-level comment, so the walk stops there only.
        createdAtOf: (comment) =>
          Math.max(
            (comment.create_time ?? 0) * 1000,
            ...(comment.reply_list ?? []).map(
              (reply) => (reply.create_time ?? 0) * 1000,
            ),
          ),
        since,
        newestFirst: true,
      })

      const sinceSeconds = toEpochSeconds(since.getTime())
      const flattened = comments
        .flatMap((comment) => [comment, ...(comment.reply_list ?? [])])
        .filter((comment) => (comment.create_time ?? 0) >= sinceSeconds)

      return toScannedComments({
        comments: flattened,
        openId: integration.openId,
        postId,
      })
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

/**
 * Same rule as the webhook's `resolveParentCommentId`: `0` means "no parent",
 * and a comment listed as its own parent is top-level.
 */
function resolveParentCommentId(comment: TiktokComment): string | undefined {
  const parentId = comment.parent_comment_id
  if (!parentId || parentId === "0" || parentId === comment.comment_id) {
    return
  }
  return parentId
}

function toScannedComments(props: {
  comments: TiktokComment[]
  openId: string
  postId: string
}): ScannedComment[] {
  const { comments, openId, postId } = props
  return comments.flatMap((comment) => {
    // The account's own comment, or no identifier to key a contact by (the
    // webhook drops those too, see `handleCommentEvent`).
    if (comment.owner === true || !comment.unique_identifier) {
      return []
    }
    return [
      {
        integrationIdentifier: openId,
        commentData: {
          commentId: comment.comment_id,
          postId,
          parentId: resolveParentCommentId(comment),
          fromId: comment.unique_identifier,
          message: comment.text,
          createdTime: comment.create_time ?? toEpochSeconds(Date.now()),
        },
      },
    ]
  })
}
