import type { ConversationHandlers } from "@chatbotx.io/sdk"
import type { WebchatAuthValue } from "../schema"

export const sendTyping: ConversationHandlers<WebchatAuthValue>["sendTyping"] =
  async (props): Promise<void> => {
    const {
      ctx,
      data: { contact, typing },
    } = props

    await ctx.platform.publishGuestRealtimeEvent(contact.sourceId, {
      eventType: "typing",
      data: { typing },
    })
  }

export const conversationHandlers = {
  sendTyping,
}
