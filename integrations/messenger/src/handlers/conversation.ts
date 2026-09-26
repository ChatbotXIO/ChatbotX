import { type ConversationHandlers, SdkException } from "@chatbotx.io/sdk"
import { sendMessage } from "../apis/message"
import type { MessengerAuthValue } from "../schema"

const sendTyping: ConversationHandlers<MessengerAuthValue>["sendTyping"] =
  async (props): Promise<void> => {
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
    })
  }

const agentMarkAsRead: ConversationHandlers<MessengerAuthValue>["agentMarkAsRead"] =
  async (props): Promise<void> => {
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
