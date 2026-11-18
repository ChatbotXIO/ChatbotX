import { logProviderErrorForChannel } from "@chatbotx.io/business/error-log"
import {
  isBulkOutboundMetadata,
  isProactiveOutboundMetadata,
} from "@chatbotx.io/flow-config"
import { ChatJobAction, type ChatJobData } from "@chatbotx.io/worker-config"
import { settleCommentAutomationFailure } from "../../lib/comment-automation-anchor"
import { logger } from "../../lib/logger"
import { settleFailedOutgoingMessage } from "./send-message"

/** The `sendError` / Error Logs detail for a send the bot quota dropped. */
export const BOT_MESSAGE_QUOTA_REACHED_ERROR = "Bot message limit reached"

/**
 * Records a bot send that the chat worker's quota gate dropped, so it does not
 * keep looking delivered.
 *
 * - `sendChannelMessage`: the outgoing `Message` row already exists (a public
 *   comment reply is written to the inbox before it is enqueued). A bot message
 *   is never one a member sent from the Inbox, so it is removed for good (with
 *   a realtime `messageRemoved`) and the failure is written to the Error Log —
 *   except for a broadcast/sequence send, whose failures stay in its own
 *   stats. Its comment-automation event flips from the optimistic `sent` to
 *   `failed`.
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
  const { conversation, contactInbox, message, metadata, isBulkBroadcast } =
    data
  const isBulkOutbound =
    isBulkOutboundMetadata(metadata, isBulkBroadcast) ||
    isBulkOutboundMetadata(message.contentAttributes?.metadata, isBulkBroadcast)

  const outcome = await settleFailedOutgoingMessage({
    message,
    conversationId: conversation.id,
    workspaceId: conversation.workspaceId,
    errorMessage: BOT_MESSAGE_QUOTA_REACHED_ERROR,
    sendFrom: data.sendFrom,
    silent: isBulkOutbound,
  })
  // No `message:failed` is emitted for a quota skip, so the removed message's
  // Error Log row is written here. Bulk sends keep it out, as everywhere.
  const isBulkOrigin =
    isProactiveOutboundMetadata(metadata) ||
    isProactiveOutboundMetadata(message.contentAttributes?.metadata)
  if (outcome === "removed" && !(isBulkOutbound || isBulkOrigin)) {
    await logProviderErrorForChannel(contactInbox.channel, {
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      sourceId: contactInbox.sourceId,
      error: new Error(BOT_MESSAGE_QUOTA_REACHED_ERROR),
    })
  }
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
