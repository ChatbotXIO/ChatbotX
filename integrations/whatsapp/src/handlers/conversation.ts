import type { ConversationHandlers } from "@chatbotx.io/sdk"
import { getWhatsappClient } from "../client"
import type { WhatsappAuthValue } from "../schema"

// WhatsApp has no standalone typing API: the indicator rides on marking a
// real inbound message read, so both handlers need that message's wamid.
const sendTyping: ConversationHandlers<WhatsappAuthValue>["sendTyping"] =
  async (props) => {
    const {
      ctx,
      data: { typing, messageSourceId },
    } = props

    if (!(typing && messageSourceId)) {
      return // no typing-off API; no anchor message to type on
    }

    const whatsappClient = getWhatsappClient(ctx.auth)

    await whatsappClient.markAsRead(
      ctx.auth.metadata.phoneNumber.id,
      messageSourceId,
      "text",
    )
  }

const agentMarkAsRead: ConversationHandlers<WhatsappAuthValue>["agentMarkAsRead"] =
  async (props) => {
    const {
      ctx,
      data: { messageSourceId },
    } = props

    if (!messageSourceId) {
      return
    }

    const whatsappClient = getWhatsappClient(ctx.auth)

    await whatsappClient.markAsRead(
      ctx.auth.metadata.phoneNumber.id,
      messageSourceId,
    )
  }

export const conversationHandlers = {
  sendTyping,
  agentMarkAsRead,
}
