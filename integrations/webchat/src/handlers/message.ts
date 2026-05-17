import type { MessageHandlers } from "@chatbotx.io/sdk"
import ky from "ky"
import type { WebchatAuthValue } from "../schema"

export const sendMessage: MessageHandlers<WebchatAuthValue>["sendMessage"] =
  async (props) => {
    const {
      ctx,
      data: { contact, message },
    } = props

    const headers = await ctx.platform.getRealtimeAuthHeaders({
      kind: "guest",
      id: contact.sourceId,
    })

    await ky
      .post(`${ctx.platform.realtimeUrl}/parties/guests/${contact.sourceId}`, {
        headers,
        json: {
          eventType: "messageCreated",
          data: message,
        },
      })
      .text()

    return {
      messageIds: [],
    }
  }

export const sendFlowStep: MessageHandlers<WebchatAuthValue>["sendFlowStep"] =
  () => Promise.resolve({ messageIds: [] })

export const messageHandlers = {
  sendMessage,
  sendFlowStep,
}
