import { commentAutomationAnalyticsService } from "@chatbotx.io/analytics"
import type { CommentAutomationReplyChannel } from "@chatbotx.io/database/partials"
import { logger } from "./logger"

/**
 * Stamped on a comment-automation reply `Message` by `postPublicCommentReply`,
 * and read back in the chat worker once the send has actually been attempted.
 *
 * It exists because the two halves of a public reply live in different queues:
 * the integration worker writes the `Message` row and the analytics event
 * (optimistically `sent`), while the Graph API call happens later in
 * `sendMessageToChannel`. Without the anchor the chat worker has no way to name
 * the event row it just invalidated, and a revoked page token would show on the
 * dashboard as 100% delivered with an empty Error Logs panel.
 */
export type CommentAutomationAnchor = {
  automationId: string
  replyChannel: CommentAutomationReplyChannel
}

/** `Message.contentAttributes` as stored: an open jsonb bag. */
type MessageLikeContentAttributes = Record<string, unknown> | null

/**
 * The anchor on an outgoing message, or `null` for any message that is not a
 * comment-automation reply — which is the overwhelming majority of sends, so
 * this stays a cheap shape check rather than a schema parse.
 */
export function readCommentAutomationAnchor(
  contentAttributes: MessageLikeContentAttributes | undefined,
): (CommentAutomationAnchor & { commentId: string }) | null {
  const anchor = contentAttributes?.commentAutomation
  const commentId = contentAttributes?.replyToCommentId
  if (!anchor || typeof anchor !== "object" || typeof commentId !== "string") {
    return null
  }

  const { automationId, replyChannel } = anchor as Partial<
    Record<keyof CommentAutomationAnchor, unknown>
  >
  if (typeof automationId !== "string" || automationId === "") {
    return null
  }
  if (replyChannel !== "public" && replyChannel !== "private") {
    return null
  }

  return { automationId, replyChannel, commentId }
}

/**
 * Flips the optimistic `sent` event a comment-automation dispatch opened to
 * `failed`, once the channel send has terminally failed.
 *
 * Only call this on the final BullMQ attempt: an intermediate failure is about
 * to be retried, and marking it `failed` would put a row in Error Logs for a
 * reply that ends up being delivered. `replyText` is deliberately not passed —
 * `settleEvent` is a partial update, so the text the send was carrying survives
 * and the Error Logs row can show what the customer never received.
 *
 * Swallows its own failures: this runs inside the send handler's catch block,
 * which still has to rethrow so BullMQ records the job failure. Bookkeeping
 * must never be able to replace the real error.
 */
export async function settleCommentAutomationFailure(props: {
  contentAttributes: MessageLikeContentAttributes | undefined
  errorDetail: string
}): Promise<void> {
  const anchor = readCommentAutomationAnchor(props.contentAttributes)
  if (!anchor) {
    return
  }

  try {
    await commentAutomationAnalyticsService.settleEvent({
      automationId: anchor.automationId,
      commentId: anchor.commentId,
      replyChannel: anchor.replyChannel,
      status: "failed",
      errorDetail: props.errorDetail,
    })
  } catch (err) {
    logger.error(
      {
        err,
        automationId: anchor.automationId,
        commentId: anchor.commentId,
        replyChannel: anchor.replyChannel,
      },
      "Failed to settle a comment automation event after a send failure",
    )
  }
}
