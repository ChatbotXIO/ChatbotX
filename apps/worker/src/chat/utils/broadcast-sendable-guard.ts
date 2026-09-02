import { broadcastService } from "@chatbotx.io/business"
import { logger } from "../../lib/logger"

/**
 * Stop/resume guard: a job already in the queue when the broadcast was
 * stopped (or resumed under a new epoch) must not deliver into a run that
 * is no longer sending. Reset the recipient so Resume re-targets it.
 *
 * Returns `true` when the caller should skip the send and return early.
 */
export async function skipIfBroadcastNotSendable(input: {
  broadcastId: string
  contactId: string
  handler: string
}): Promise<boolean> {
  const { broadcastId, contactId, handler } = input

  const sendable = await broadcastService.findSendableBroadcast(broadcastId)
  if (sendable) {
    return false
  }

  await broadcastService.resetContactForResume({
    broadcastId,
    contactKey: { contactId },
  })
  logger.debug(
    { broadcastId, contactId },
    `${handler}: broadcast no longer sendable, skipping send`,
  )
  return true
}
