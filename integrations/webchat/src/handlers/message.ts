import type { MessageHandlers } from "@chatbotx.io/sdk"
import { logger } from "../lib/logger"
import type { WebchatAuthValue } from "../schema"

export const sendMessage: MessageHandlers<WebchatAuthValue>["sendMessage"] = (
  props,
) => {
  const {
    ctx,
    data: { contact, message },
  } = props

  // Deliberately fire-and-forget: by the time this handler runs, the message
  // is already durably persisted (that's what `sentCount` reports — the
  // message was accepted and stored). The realtime publish below is only a
  // best-effort live push to an already-connected browser socket (bounded
  // retry on a transient Redis blip); if it still fails, the guest only
  // picks the message up on its next page load or realtime reconnect, not
  // immediately, so its failure must not flip `sentCount` to 0 or delay the
  // response.
  ctx.platform
    .publishGuestRealtimeEvent(contact.sourceId, {
      eventType: "messageCreated",
      data: message,
    })
    .catch((error: unknown) => {
      logger.error(
        { err: error, contactSourceId: contact.sourceId },
        "Failed to publish guest realtime event",
      )
    })

  return Promise.resolve({
    messageIds: [],
    sentCount: 1,
  })
}

// Delivered by the worker itself through the guest realtime stream
// (`send-flow-step.ts` → `publishGuestRealtimeEvent`), not by this handler —
// but that still counts as one accepted outgoing message for quota/analytics.
export const sendFlowStep: MessageHandlers<WebchatAuthValue>["sendFlowStep"] =
  () => Promise.resolve({ messageIds: [], sentCount: 1 })

export const messageHandlers = {
  sendMessage,
  sendFlowStep,
}
