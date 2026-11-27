import { broadcastService } from "@chatbotx.io/business"
import { BROADCAST_PAYLOAD_TYPE } from "@chatbotx.io/flow-config"
import { casStore } from "@chatbotx.io/redis"
import { ChannelError, isAccountSendBlocked } from "@chatbotx.io/sdk"
import { logger } from "../../lib/logger"
import type { ChannelSendErrorContext } from "./channel-send-error-types"

// A blocked page fails every queued recipient at once; one stop is enough, so
// the burst after the first error is coalesced for this long. The stop itself
// is idempotent, which is why losing Redis only costs duplicate (cheap) work.
const BURST_WINDOW_MS = 2000
const burstKey = (inboxId: string): string =>
  `broadcast:account-block-stop:${inboxId}`

// Bounded: entries older than the burst window are pruned on every insert.
const recentStopByInbox = new Map<string, number>()

const isBroadcastSend = (context: ChannelSendErrorContext): boolean =>
  context.metadata?.type === BROADCAST_PAYLOAD_TYPE

/** True when this process or another one already handled the burst. */
const isBurstHandled = async (inboxId: string): Promise<boolean> => {
  const now = Date.now()
  const last = recentStopByInbox.get(inboxId)
  if (last !== undefined && now - last < BURST_WINDOW_MS) {
    return true
  }
  for (const [id, at] of recentStopByInbox) {
    if (now - at >= BURST_WINDOW_MS) {
      recentStopByInbox.delete(id)
    }
  }
  recentStopByInbox.set(inboxId, now)
  try {
    return !(await casStore.setIfAbsent(burstKey(inboxId), 1, BURST_WINDOW_MS))
  } catch (err) {
    logger.warn({ err, inboxId }, "Burst guard unavailable; stopping anyway")
    return false
  }
}

/**
 * A broadcast send was refused because the channel account itself is blocked
 * from sending (`ChannelError.reason`, assigned by each channel's mapper):
 * every recipient of every running broadcast of that page would fail the same
 * way, so they are stopped (the customer resumes once the page is unblocked).
 * Only broadcast sends trigger it; inbox, flow and sequence sends do not.
 *
 * Always returns `false`: the send error is still recorded and retried exactly
 * as before, and a failure here is only logged.
 */
export async function reconcileAccountSendBlocked(
  context: ChannelSendErrorContext,
): Promise<boolean> {
  const { error, contactInbox, conversation } = context
  if (
    !(
      error instanceof ChannelError &&
      error.reason !== undefined &&
      isAccountSendBlocked(error) &&
      isBroadcastSend(context)
    )
  ) {
    return false
  }

  const { inboxId } = contactInbox
  try {
    if (await isBurstHandled(inboxId)) {
      return false
    }
    await broadcastService.stopSendingForBlockedAccount({
      workspaceId: conversation.workspaceId,
      inboxId,
      channel: contactInbox.channel,
      reason: error.reason,
      errorMessage: error.message,
    })
  } catch (err) {
    // Forget both marks so the next error of the burst can try again.
    recentStopByInbox.delete(inboxId)
    await casStore.del(burstKey(inboxId)).catch((delErr: unknown) => {
      logger.warn({ err: delErr, inboxId }, "Unable to release the burst guard")
    })
    logger.error(
      { err, inboxId },
      "Unable to stop broadcasts for a blocked channel account",
    )
  }
  return false
}
