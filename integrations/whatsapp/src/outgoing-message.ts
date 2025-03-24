import {
  type Context,
  type ConversationEntity,
  FileType,
  type MessageEntity,
} from "@ahachat.ai/sdk"
import { Audio, Document, Image, Text, Video } from "whatsapp-api-js/messages"
import type {
  ClientMessage,
  ServerErrorResponse,
  ServerSentMessageResponse,
} from "whatsapp-api-js/types"
import { getWhatsappClient } from "./client"
import type { WhatsappAuthValue } from "./schemas"

export type SendMessageProps = {
  ctx: Context<WhatsappAuthValue>
  conversation: ConversationEntity
  message: MessageEntity
}

const convertMessageToWhatsappMessage = (
  message: MessageEntity,
): ClientMessage | null => {
  if (!message.attachments || !message.attachments[0]) {
    return new Text(message.content ?? "")
  }

  const attachment = message.attachments[0]

  if (attachment.fileType === FileType.AUDIO) {
    return new Audio(attachment.publicUrl ?? "")
  }

  if (attachment.fileType === FileType.FILE) {
    return new Document(attachment.publicUrl ?? "")
  }

  if (attachment.fileType === FileType.IMAGE) {
    return new Image(attachment.publicUrl ?? "")
  }

  if (attachment.fileType === FileType.VIDEO) {
    return new Video(attachment.publicUrl ?? "")
  }

  return null
}

export const sendOutgoingMessage = async (
  ctx: Context<WhatsappAuthValue>,
  conversation: ConversationEntity,
  message: MessageEntity,
) => {
  const whatsappClient = getWhatsappClient(ctx.auth)

  try {
    const whatsappMessage = convertMessageToWhatsappMessage(message)
    if (!whatsappMessage) {
      ctx.logger.error("Unable to parse outgoing message", message)
      return
    }

    const sendResponse = await whatsappClient.sendMessage(
      conversation.conversationAttributes.phoneNumberId as string,
      conversation.sourceId,
      whatsappMessage,
    )
    const serverError = sendResponse as ServerErrorResponse

    if (serverError?.error) {
      ctx.logger.error(
        `Failed to send message of type ${whatsappMessage._type}`,
        serverError.error,
      )
      return
    }

    const messageId = (sendResponse as ServerSentMessageResponse)?.messages?.[0]
      ?.id
    if (messageId) {
      ctx.logger.info("Message sent successfully", {
        messageId,
        messageType: whatsappMessage._type,
      })
      return
    }

    ctx.logger.warn(
      `Message of type ${whatsappMessage._type} could not be sent`,
      sendResponse,
    )
  } catch (error) {
    ctx.logger.error("An error occurred while sending the message", error)
  }
}
