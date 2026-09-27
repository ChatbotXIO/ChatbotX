import { type ConversationHandlers, SdkException } from "@chatbotx.io/sdk"
import { sendMessage } from "../apis/message"
import type { InstagramAuthValue } from "../schema"

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

    await sendMessage(ctx.auth, {
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

    await sendMessage(ctx.auth, {
      recipient: { id: recipientId },
      sender_action: "mark_seen",
    })
  }

export const conversationHandlers = {
  sendTyping,
  agentMarkAsRead,
}
