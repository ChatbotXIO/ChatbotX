import type { ConversationHandlers } from "@chatbotx.io/sdk"
import { getWhatsappClient } from "../client"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { logger } from "../lib/logger"
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
    const {
      ctx,
      data: { messageId },
    } = props

    if (!messageId) {
      logger.debug(
        { phoneId: ctx.auth.metadata.phoneNumber.id },
        "Skipping WhatsApp mark as read: missing incoming message_id",
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
          "Failed to mark WhatsApp message as read",
        )
      }
    } catch (err) {
      logger.debug(
        { err, messageId, phoneId: ctx.auth.metadata.phoneNumber.id },
        "Error sending WhatsApp mark as read request",
      )
    }
  }

const sendReaction: ConversationHandlers<WhatsappAuthValue>["sendReaction"] =
  async (props) => {
    const {
      ctx,
      data: { contact, emoji, messageId },
    } = props

    if (!messageId) {
      logger.debug(
        { phoneId: ctx.auth.metadata.phoneNumber.id },
        "Skipping WhatsApp reaction: missing incoming message_id",
      )
      return
    }

    if (!contact.sourceId) {
      logger.debug(
        { phoneId: ctx.auth.metadata.phoneNumber.id },
        "Skipping WhatsApp reaction: missing recipient phone number (sourceId)",
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
            recipient_type: "individual",
            to: contact.sourceId,
            type: "reaction",
            reaction: {
              message_id: messageId,
              emoji,
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
            emoji,
            phoneId: ctx.auth.metadata.phoneNumber.id,
          },
          "Failed to send WhatsApp reaction",
        )
      }
    } catch (err) {
      logger.debug(
        { err, messageId, emoji, phoneId: ctx.auth.metadata.phoneNumber.id },
        "Error sending WhatsApp reaction request",
      )
    }
  }

export const conversationHandlers = {
  sendTyping,
  agentMarkAsRead,
  sendReaction,
}
