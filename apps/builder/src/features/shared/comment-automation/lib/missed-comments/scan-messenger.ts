import { messengerIntegrationService } from "@chatbotx.io/business"
import {
  type FacebookPostComment,
  listPostComments,
} from "@chatbotx.io/integration-messenger/apis/comment"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger/schema"
import { collectCommentsSince, parseGraphTime, toEpochSeconds } from "./paging"
import {
  MissedCommentsIntegrationNotFoundError,
  type ScanCommentsProps,
  type ScannedComment,
} from "./types"

/** The story id after the last `_` of a composite `{pageId}_{storyId}` id. */
function trailingStoryId(postId: string): string {
  return postId.slice(postId.lastIndexOf("_") + 1)
}

/**
 * Facebook comments on the automation's post, shaped like the `feed` webhook.
 *
 * The post picker stores either a composite `{pageId}_{storyId}` id or a bare
 * one (reels, manual entry). The webhook always reports the composite, and the
 * comment conversation is keyed by it, so every replay uses the composite too —
 * a bare id would open a second conversation for the same post. A composite
 * names its page; a bare id is tried against each connected page in turn.
 */
export async function scanMessengerComments(
  props: ScanCommentsProps,
): Promise<ScannedComment[]> {
  const { workspaceId, postId, since } = props
  const integrations =
    await messengerIntegrationService.findByWorkspaceId(workspaceId)

  const pageIdInPostId = postId.includes("_")
    ? postId.slice(0, postId.indexOf("_"))
    : undefined
  const candidates = pageIdInPostId
    ? integrations.filter(
        (integration) => integration.pageId === pageIdInPostId,
      )
    : integrations

  if (candidates.length === 0) {
    throw new MissedCommentsIntegrationNotFoundError()
  }

  const storyId = trailingStoryId(postId)
  let lastError: unknown
  for (const integration of candidates) {
    const auth = integration.auth as MessengerAuthValue
    const compositePostId = `${integration.pageId}_${storyId}`
    try {
      const comments = await collectCommentsSince<FacebookPostComment, string>({
        fetchPage: async (after) => {
          const page = await listPostComments({
            auth,
            postId: compositePostId,
            after,
          })
          return { items: page.comments, nextCursor: page.nextCursor }
        },
        createdAtOf: (comment) => parseGraphTime(comment.created_time),
        since,
        newestFirst: true,
      })
      return toScannedComments({
        comments,
        pageId: integration.pageId,
        postId: compositePostId,
      })
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

function toScannedComments(props: {
  comments: FacebookPostComment[]
  pageId: string
  postId: string
}): ScannedComment[] {
  const { comments, pageId, postId } = props
  return comments.flatMap((comment) => {
    const fromId = comment.from?.id
    // No author to key a contact by, or the Page's own comment.
    if (!fromId || fromId === pageId) {
      return []
    }
    return [
      {
        integrationIdentifier: pageId,
        commentData: {
          commentId: comment.id,
          postId,
          // A top-level comment has no `parent`; the webhook's `parent_id`
          // is then the post, which `isCommentReply` reads as "not a reply".
          parentId: comment.parent?.id ?? postId,
          fromId,
          fromName: comment.from?.name,
          message: comment.message,
          tags: comment.message_tags?.flatMap(({ id, name }) =>
            id ? [{ id, name }] : [],
          ),
          createdTime: toEpochSeconds(parseGraphTime(comment.created_time)),
        },
      },
    ]
  })
}
