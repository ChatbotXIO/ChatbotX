import type { ConversationHandlers } from "@chatbotx.io/sdk"
import { logger } from "../lib/logger"
import type { WebchatAuthValue } from "../schema"

export const sendTyping: ConversationHandlers<WebchatAuthValue>["sendTyping"] =
  (props): Promise<void> => {
    const {
      ctx,
      data: { contact, typing },
    } = props

    // Deliberately fire-and-forget: a typing indicator is inherently
    // ephemeral best-effort UI, not a tracked/billed send like a message —
    // there is no sentCount here to get wrong, and waiting on (or failing)
    // this publish would only delay/break the response for no benefit.
    ctx.platform
      .publishGuestRealtimeEvent(contact.sourceId, {
        eventType: "typing",
        data: { typing },
      })
      .catch((error: unknown) => {
        logger.error(
          { err: error, contactSourceId: contact.sourceId },
          "Failed to publish guest realtime event",
        )
      })

    return Promise.resolve()
  }

export const conversationHandlers = {
  sendTyping,
}
