import { threadControlService } from "@chatbotx.io/business"
import { toThreadControlTimestamp } from "@chatbotx.io/database/partials"
import { THREAD_CONTROL_REJECTION_CODES } from "@chatbotx.io/integration-whatsapp"
import { ChannelError } from "@chatbotx.io/sdk"
import { logger } from "../../lib/logger"
import type { ChannelSendErrorContext } from "./channel-send-error-types"

const isThreadControlRejection = (error: unknown): boolean =>
  error instanceof ChannelError &&
  THREAD_CONTROL_REJECTION_CODES.has(Number(error.code))

/**
 * Meta rejected our Service send because another responder owns the thread.
 * That is the ground truth the local gate could not know (there is no API for
 * the current owner), so it is recorded as `serviceRejected` and the composer
 * locks. Always returns `false`: the send error is still shown on the message,
 * and the rejection is already non-retryable (`PERMISSION_DENIED`).
 *
 * Bookkeeping must not mask the send error, so a failure here is only logged.
 */
export async function reconcileThreadControlRejection(
  context: ChannelSendErrorContext,
): Promise<boolean> {
  if (!isThreadControlRejection(context.error)) {
    return false
  }
  const { contactInbox, conversation } = context
  try {
    await threadControlService.recordEvent({
      workspaceId: conversation.workspaceId,
      inbox: { id: contactInbox.inboxId, threadControlSeenAt: null },
      contactInbox,
      conversationId: conversation.id,
      event: "serviceRejected",
      occurredAt: toThreadControlTimestamp(new Date()),
    })
  } catch (err) {
    logger.warn(
      { err, contactInboxId: contactInbox.id },
      "Unable to record a rejected service send for conversation routing",
    )
  }
  return false
}
