import type { ConversationHandlers } from "@chatbotx.io/sdk"
import { getWhatsappClient } from "../client"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { logger } from "../lib/logger"
import type { WhatsappAuthValue } from "../schema"

const sendTyping: ConversationHandlers<WhatsappAuthValue>["sendTyping"] =
  async (props) => {
    const {
      ctx,
      data: { typing, messageId },
    } = props

    if (!typing) {
      return // WhatsApp Cloud API does not support explicit typing off
    }

    if (!messageId) {
      logger.debug(
        { phoneId: ctx.auth.metadata.phoneNumber.id },
        "Skipping WhatsApp typing indicator: missing incoming message_id",
      )
      return
    }

    const whatsappClient = getWhatsappClient(ctx.auth)

    try {
      const response = await whatsappClient.$$apiFetch$$(
        `${API_URL}/${DEFAULT_API_VERSION}/${ctx.auth.metadata.phoneNumber.id}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            status: "read",
            message_id: messageId,
            typing_indicator: {
              type: "text",
            },
          }),
        },
      )

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null)
        logger.debug(
          {
            status: response.status,
            errorBody,
            messageId,
            phoneId: ctx.auth.metadata.phoneNumber.id,
          },
          "Failed to display WhatsApp typing indicator",
        )
      }
    } catch (err) {
      logger.debug(
        { err, messageId, phoneId: ctx.auth.metadata.phoneNumber.id },
        "Error sending WhatsApp typing indicator request",
      )
    }
  }

const agentMarkAsRead: ConversationHandlers<WhatsappAuthValue>["agentMarkAsRead"] =
  async () => {
    // WhatsApp Cloud API requires a specific incoming message_id to mark as read.
    // Without a message_id in the contact payload, this is a safe no-op.
  }

export const conversationHandlers = {
  sendTyping,
  agentMarkAsRead,
}
