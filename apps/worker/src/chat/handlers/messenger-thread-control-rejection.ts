import {
  type ThreadControlSnapshot,
  threadControlService,
} from "@chatbotx.io/business"
import { syncThreadOwner } from "@chatbotx.io/channel-registry/thread-control"
import { toThreadControlTimestamp } from "@chatbotx.io/database/partials"
import { isThreadControlRejection } from "@chatbotx.io/integration-messenger"
import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { logger } from "../../lib/logger"
import type { ChannelSendErrorContext } from "./channel-send-error-types"

/**
 * Records the refusal as a `serviceRejected` event, keeping the stored owner
 * identity (the event only adds the refusal; it never rewrites who owns the
 * thread). A failure is logged, never thrown.
 */
const recordServiceRejected = async (
  context: ChannelSendErrorContext,
  owner: { ownerRole: string | null; ownerAppId: string | null },
): Promise<void> => {
  const { contactInbox, conversation } = context
  try {
    await threadControlService.recordEvent({
      workspaceId: conversation.workspaceId,
      inbox: { id: contactInbox.inboxId, threadControlSeenAt: null },
      contactInbox,
      conversationId: conversation.id,
      event: "serviceRejected",
      ownerRole: owner.ownerRole,
      ownerAppId: owner.ownerAppId,
      occurredAt: toThreadControlTimestamp(new Date()),
    })
  } catch (err) {
    logger.warn(
      { err, contactInboxId: contactInbox.id },
      "Unable to record a rejected Messenger send for conversation routing",
    )
  }
}

/**
 * Messenger refused our Send API call. Meta returns `PERMISSION_DENIED` when
 * another app owns the thread, but has no dedicated code for it, so the
 * category alone proves nothing. A known rejection subcode is proof enough and
 * records `serviceRejected` without a query. Otherwise the thread owner is
 * observed ONCE (`syncThreadOwner`: one `GET /me/thread_owner` that also
 * reconciles the stored state), and `serviceRejected` is recorded only when
 * that single observation shows a FOREIGN owner (the thread resolves to
 * standby). If we still own the thread, the answer is ambiguous, or the query
 * fails, nothing is recorded and the error surfaces normally.
 * It never re-enters the send path and runs only on this rare refusal.
 *
 * Always returns `false`: the send error still shows on the message, and the
 * refusal is non-retryable (`PERMISSION_DENIED`). Bookkeeping must not mask the
 * send error, so a failure here is only logged.
 */
export async function reconcileMessengerThreadControlRejection(
  context: ChannelSendErrorContext,
): Promise<boolean> {
  const { error, contactInbox, conversation } = context
  if (
    !(
      error instanceof ChannelError &&
      error.category === ChannelErrorCategory.PERMISSION_DENIED
    )
  ) {
    return false
  }
  if (isThreadControlRejection(error)) {
    await recordServiceRejected(context, {
      ownerRole: contactInbox.threadOwnerRole ?? null,
      ownerAppId: contactInbox.threadOwnerAppId ?? null,
    })
    return false
  }

  let snapshot: ThreadControlSnapshot
  try {
    snapshot = await syncThreadOwner({
      workspaceId: conversation.workspaceId,
      contactInbox,
      conversationId: conversation.id,
    })
  } catch (err) {
    logger.warn(
      { err, contactInboxId: contactInbox.id },
      "Unable to sync the Messenger thread owner after a rejected send",
    )
    return false
  }
  if (snapshot.threadControlState !== "standby") {
    return false
  }
  await recordServiceRejected(context, {
    ownerRole: snapshot.threadOwnerRole,
    ownerAppId: snapshot.threadOwnerAppId,
  })
  return false
}
