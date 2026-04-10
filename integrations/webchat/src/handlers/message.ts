import type { MessageHandlers } from "@chatbotx.io/sdk"
import ky from "ky"
import type { WebchatAuthValue } from "../schema"

export const sendMessage: MessageHandlers<WebchatAuthValue>["sendMessage"] =
  async (props) => {
    const {
      ctx,
      data: { contact, message },
    } = props

    await ky
      .post(`${ctx.auth.websocketUrl}/parties/guests/${contact.sourceId}`, {
        headers: {
          "X-API-Key": ctx.auth.apiKey,
        },
        json: {
          eventType: "messageCreated",
          data: message,
        },
      })
      .json()

    return {
      messageIds: [],
    }
  }

export const messageHandlers = {
  sendMessage,
}
