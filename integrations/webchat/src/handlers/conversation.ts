import type { ConversationHandlers } from "@chatbotx.io/sdk"
import ky from "ky"
import type { WebchatAuthValue } from "../schema"

export const sendTyping: ConversationHandlers<WebchatAuthValue>["sendTyping"] =
  async (props): Promise<void> => {
    const {
      ctx,
      data: { contact, typing },
    } = props

    const headers = await ctx.platform.getRealtimeBroadcastAuthHeaders({
      kind: "guest",
      id: contact.sourceId,
    })

    await ky
      .post(`parties/guests/${contact.sourceId}`, {
        baseUrl: ctx.platform.internalRealtimeUrl,
        headers,
        json: {
          eventType: "typing",
          data: {
            typing,
          },
        },
      })
      .json()
  }

export const conversationHandlers = {
  sendTyping,
}
