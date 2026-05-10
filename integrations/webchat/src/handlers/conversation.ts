import type { ConversationHandlers } from "@chatbotx.io/sdk"
import ky from "ky"
import type { WebchatAuthValue } from "../schema"

export const sendTyping: ConversationHandlers<WebchatAuthValue>["sendTyping"] =
  async (props): Promise<void> => {
    const {
      ctx,
      data: { contact, typing },
    } = props

    await ky
      .post(`${ctx.platform.realtimeUrl}/parties/guests/${contact.sourceId}`, {
        headers: {
          "X-API-Key": ctx.platform.realtimeApiKey,
        },
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
