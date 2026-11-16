import { isBulkOutboundMetadata } from "@chatbotx.io/flow-config"
import { ChatJobAction, type ChatJobData } from "@chatbotx.io/worker-config"
import { settleCommentAutomationFailure } from "../../lib/comment-automation-anchor"
import { logger } from "../../lib/logger"
import { recordMessageSendError } from "./send-message"

/** The `sendError` / Error Logs detail for a send the bot quota dropped. */
export const BOT_MESSAGE_QUOTA_REACHED_ERROR = "Bot message limit reached"

/**
 * Records a bot send that the chat worker's quota gate dropped, so it does not
 * keep looking delivered.
 *
 * - `sendChannelMessage`: the outgoing `Message` row already exists (a public
 *   comment reply is written to the inbox before it is enqueued), so it gets a
 *   `sendError` and a realtime `messageFailed`, and its comment-automation event
 *   flips from the optimistic `sent` to `failed`.
 * - `sendFlowMessage` carrying a comment-automation anchor: no message exists
 *   yet, so only the automation event is settled `failed`. A `spent` anchor
 *   means the comment's first DM already went out, so that event stays as is.
 * - Every other bot send creates its message inside the handler, so there is
 *   nothing to mark.
 *
 * Never throws: the gate must still drop the job without a retry.
 */
export async function recordQuotaSkippedSend(
  jobData: ChatJobData,
): Promise<void> {
  try {
    if (jobData.type === ChatJobAction.sendChannelMessage) {
      await recordSkippedChannelMessage(jobData.data)
      return
    }
    if (jobData.type === ChatJobAction.sendFlowMessage) {
      await recordSkippedFlowMessage(jobData.data)
    }
  } catch (err) {
    logger.error(
      { err, jobType: jobData.type },
      "Failed to record a send skipped by the bot message quota",
    )
  }
}

async function recordSkippedChannelMessage(
  data: Extract<
    ChatJobData,
    { type: typeof ChatJobAction.sendChannelMessage }
  >["data"],
): Promise<void> {
  const { conversation, message, metadata, isBulkBroadcast } = data
  const isBulkOutbound =
    isBulkOutboundMetadata(metadata, isBulkBroadcast) ||
    isBulkOutboundMetadata(message.contentAttributes?.metadata, isBulkBroadcast)

  await recordMessageSendError(
    message.id,
    message.clientId,
    conversation.workspaceId,
    message.createdAt ? new Date(message.createdAt) : undefined,
    BOT_MESSAGE_QUOTA_REACHED_ERROR,
    { conversationId: conversation.id, silent: isBulkOutbound },
  )
  await settleCommentAutomationFailure({
    contentAttributes: message.contentAttributes,
    errorDetail: BOT_MESSAGE_QUOTA_REACHED_ERROR,
  })
}

async function recordSkippedFlowMessage(
  data: Extract<
    ChatJobData,
    { type: typeof ChatJobAction.sendFlowMessage }
  >["data"],
): Promise<void> {
  const anchor = data.commentAnchor
  if (!anchor?.automationId || anchor.spent) {
    return
  }

  // The shape `readCommentAutomationAnchor` reads, as `sendFlowStep` stamps it.
  await settleCommentAutomationFailure({
    contentAttributes: {
      replyToCommentId: anchor.commentId,
      commentAutomation: {
        automationId: anchor.automationId,
        replyChannel: anchor.replyChannel,
      },
    },
    errorDetail: BOT_MESSAGE_QUOTA_REACHED_ERROR,
  })
}
