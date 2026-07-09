import { type ConversationHandlers, SdkException } from "@chatbotx.io/sdk"
import { sendInstagramMessage } from "../apis/page"
import type { InstagramAuthValue } from "../schemas"

const sendTyping: ConversationHandlers<InstagramAuthValue>["sendTyping"] =
  async (props) => {
    const {
      ctx,
      data: { contact, typing },
    } = props

    const recipientId = contact.sourceId

    if (!recipientId) {
      throw new SdkException("Missing recipient ID in conversation")
    }

    await sendInstagramMessage(ctx.auth, {
      recipient: { id: recipientId },
      sender_action: typing ? "typing_on" : "typing_off",
      messaging_type: "RESPONSE",
    })
  }

const agentMarkAsRead: ConversationHandlers<InstagramAuthValue>["agentMarkAsRead"] =
  async (props) => {
    const {
      ctx,
      data: { contact },
    } = props

    const recipientId = contact.sourceId
    if (!recipientId) {
      throw new SdkException("Missing recipient ID in conversation")
    }

    await sendInstagramMessage(ctx.auth, {
      recipient: { id: recipientId },
      sender_action: "mark_seen",
    })
  }

export const conversationHandlers = {
  sendTyping,
  agentMarkAsRead,
}
