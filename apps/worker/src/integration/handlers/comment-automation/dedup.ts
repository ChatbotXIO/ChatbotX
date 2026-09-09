import { fbCommentAutomationService } from "@chatbotx.io/business"
import { logger } from "../../../lib/logger"

/**
 * Identifies the dedup row `processCommentAutomation` writes as soon as a reply
 * is enqueued — not once it is delivered. Async reply jobs carry it so a job
 * that ends up delivering nothing can release the row instead of leaving the
 * contact blocked forever by `replyOncePerUserPerPost`.
 */
export type CommentAutomationDedup = {
  automationId: string
  contactId: string
  postId: string
  workspaceId: string
}

/**
 * Releases the dedup row so the contact's next comment is eligible again.
 * Never throws: every caller is already on a bail-out path, and a failed
 * cleanup must not turn a silent skip into a job retry that re-sends the other
 * branch's reply.
 */
export async function rollbackCommentDedup(props: {
  dedup: CommentAutomationDedup | undefined
  commentId: string
  reason: string
}): Promise<void> {
  if (!props.dedup) {
    return
  }

  try {
    await fbCommentAutomationService.deleteDedup(props.dedup)
  } catch (err) {
    logger.error(
      {
        err,
        commentId: props.commentId,
        reason: props.reason,
        ...props.dedup,
      },
      "Failed to roll back the comment automation dedup row",
    )
  }
}
