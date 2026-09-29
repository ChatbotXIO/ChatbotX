import { instagramIntegrationService } from "@chatbotx.io/business"
import {
  type InstagramMediaComment,
  listMediaComments as listInstagramLoginMediaComments,
} from "@chatbotx.io/integration-instagram/apis/comment"
import type { InstagramAuthValue } from "@chatbotx.io/integration-instagram/schema"
import type { InstagramAuthValue as InstagramFacebookAuthValue } from "@chatbotx.io/integration-instagram-facebook"
import { listMediaComments as listInstagramFacebookMediaComments } from "@chatbotx.io/integration-instagram-facebook/apis/comment"
import { collectCommentsSince, parseGraphTime, toEpochSeconds } from "./paging"
import {
  MissedCommentsIntegrationNotFoundError,
  type ScanCommentsProps,
  type ScannedComment,
} from "./types"

type InstagramCommentAutomationType = "instagram" | "instagramFacebook"

type InstagramCommentFields = Omit<InstagramMediaComment, "replies">

/**
 * Instagram comments (and their replies) on the automation's media, shaped like
 * the `comments` webhook. Media ids are unique per account, so each connected
 * account of the automation's login type is tried until one owns the media.
 */
export async function scanInstagramComments(
  props: ScanCommentsProps & { type: InstagramCommentAutomationType },
): Promise<ScannedComment[]> {
  const { workspaceId, postId, since, type } = props
  const integrations = await instagramIntegrationService.findByWorkspaceId(
    workspaceId,
    type === "instagram" ? "instagram" : "facebook",
  )

  if (integrations.length === 0) {
    throw new MissedCommentsIntegrationNotFoundError()
  }

  let lastError: unknown
  for (const integration of integrations) {
    try {
      const comments = await collectCommentsSince<
        InstagramMediaComment,
        string
      >({
        fetchPage: async (after) => {
          const page =
            type === "instagram"
              ? await listInstagramLoginMediaComments({
                  auth: integration.auth as InstagramAuthValue,
                  mediaId: postId,
                  after,
                })
              : await listInstagramFacebookMediaComments({
                  auth: integration.auth as InstagramFacebookAuthValue,
                  mediaId: postId,
                  after,
                })
          return { items: page.comments, nextCursor: page.nextCursor }
        },
        // A thread is kept when the comment OR any reply is recent; replies
        // are filtered on their own time below.
        createdAtOf: (comment) =>
          Math.max(
            parseGraphTime(comment.timestamp),
            ...(comment.replies?.data ?? []).map((reply) =>
              parseGraphTime(reply.timestamp),
            ),
          ),
        since,
        newestFirst: false,
      })

      const sinceMs = since.getTime()
      const flattened = comments
        .flatMap((comment) => [comment, ...(comment.replies?.data ?? [])])
        .filter((comment) => parseGraphTime(comment.timestamp) >= sinceMs)

      return toScannedComments({
        comments: flattened,
        igId: integration.igId,
        postId,
      })
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

function toScannedComments(props: {
  comments: InstagramCommentFields[]
  igId: string
  postId: string
}): ScannedComment[] {
  const { comments, igId, postId } = props
  return comments.flatMap((comment) => {
    const fromId = comment.from?.id
    // No author to key a contact by, or the account's own comment.
    if (!fromId || fromId === igId) {
      return []
    }
    const username = comment.from?.username ?? comment.username
    return [
      {
        integrationIdentifier: igId,
        commentData: {
          commentId: comment.id,
          postId,
          parentId: comment.parent_id,
          fromId,
          fromName: username ?? fromId,
          fromUsername: username,
          message: comment.text,
          createdTime: toEpochSeconds(parseGraphTime(comment.timestamp)),
        },
      },
    ]
  })
}
