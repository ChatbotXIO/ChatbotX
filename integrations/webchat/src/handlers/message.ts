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
