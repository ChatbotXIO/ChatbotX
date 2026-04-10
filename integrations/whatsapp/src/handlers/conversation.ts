import type { ConversationHandlers } from "@chatbotx.io/sdk"
import { getWhatsappClient } from "../client"
import type { WhatsappAuthValue } from "../schema"

const sendTyping: ConversationHandlers<WhatsappAuthValue>["sendTyping"] =
  async (props) => {
    const {
      ctx,
      data: { typing },
    } = props

    if (!typing) {
      return // does not support typing off
    }

    const whatsappClient = getWhatsappClient(ctx.auth)

    await whatsappClient.markAsRead(
      ctx.auth.metadata.phoneNumber.id,
      "lastMessageId", // TODO: get last message id
      "text",
    )
  }

const agentMarkAsRead: ConversationHandlers<WhatsappAuthValue>["agentMarkAsRead"] =
  async (props) => {
    const { ctx } = props

    const whatsappClient = getWhatsappClient(ctx.auth)

    await whatsappClient.markAsRead(
      ctx.auth.metadata.phoneNumber.id,
      "lastMessageId", // TODO: get last message id
    )
  }

export const conversationHandlers = {
  sendTyping,
  agentMarkAsRead,
}
