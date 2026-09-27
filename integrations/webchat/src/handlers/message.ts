import type { MessageHandlers } from "@chatbotx.io/sdk"
import type { WebchatAuthValue } from "../schema"

export const sendMessage: MessageHandlers<WebchatAuthValue>["sendMessage"] =
  async (props) => {
    const {
      ctx,
      data: { contact, message },
    } = props

    await ctx.platform.publishGuestRealtimeEvent(contact.sourceId, {
      eventType: "messageCreated",
      data: message,
    })

    return {
      messageIds: [],
      sentCount: 1,
    }
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
