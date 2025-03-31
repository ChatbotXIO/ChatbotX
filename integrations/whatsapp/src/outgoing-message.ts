import {
  type Context,
  type ConversationEntity,
  FileType,
  type MessageEntity,
} from "@ahachat.ai/sdk"
import type { ILogObj, Logger } from "tslog"
import { Audio, Document, Image, Text, Video } from "whatsapp-api-js/messages"
import type {
  ClientMessage,
  ServerErrorResponse,
  ServerSentMessageResponse,
} from "whatsapp-api-js/types"
import { getWhatsappClient } from "./client"
import { generateOutgoingMessages as generateSendCardOutgoingMessages } from "./message-types/send-card"
import { generateOutgoingMessages as generateSendCarouselOutgoingMessages } from "./message-types/send-carousel"
import { generateOutgoingMessages as generateSendImageOutgoingMessages } from "./message-types/send-image"
import { generateOutgoingMessages as generateSendTextOutgoingMessages } from "./message-types/send-text"
import type { WhatsappAuthValue } from "./schemas"
import { sleep } from "./util"

export function* convertMessageToWhatsappMessage(
  flowVersionId: string,
  message: MessageEntity,
  logger: Logger<ILogObj>,
): Generator<ClientMessage | null> {
  const attributes = message.contentAttributes

  if (attributes) {
    // Check message from flow
    switch (attributes.actionType) {
      case "SendText":
        for (const message of generateSendTextOutgoingMessages(
          flowVersionId,
          attributes,
          logger,
        )) {
          yield message
        }
        return
      case "SendImage":
        for (const message of generateSendImageOutgoingMessages(
          attributes,
          logger,
        )) {
          yield message
        }
        return
      case "SendCard":
        for (const message of generateSendCardOutgoingMessages(
          flowVersionId,
          attributes,
          logger,
        )) {
          yield message
        }
        return
      case "SendCarousel":
        for (const message of generateSendCarouselOutgoingMessages(
          flowVersionId,
          attributes,
          logger,
        )) {
          yield message
        }
        return
    }
  }

  if (!message.attachments || !message.attachments[0]) {
    yield new Text(message.content ?? "")
    return
  }

  const attachment = message.attachments[0]

  if (attachment.fileType === FileType.AUDIO) {
    yield new Audio(attachment.publicUrl ?? "")
    return
  }

  if (attachment.fileType === FileType.FILE) {
    yield new Document(attachment.publicUrl ?? "")
    return
  }

  if (attachment.fileType === FileType.IMAGE) {
    yield new Image(attachment.publicUrl ?? "")
    return
  }

  if (attachment.fileType === FileType.VIDEO) {
    yield new Video(attachment.publicUrl ?? "")
    return
  }

  yield null
}

export const sendOutgoingMessage = async (
  ctx: Context<WhatsappAuthValue>,
  conversation: ConversationEntity,
  message: MessageEntity,
  flowVersionId: string,
) => {
  const whatsappClient = getWhatsappClient(ctx.auth)
  let startGenerator = false

  try {
    for (const whatsappMessage of convertMessageToWhatsappMessage(
      flowVersionId,
      message,
      ctx.logger,
    )) {
      if (startGenerator) {
        await sleep(1000)
      }
      if (!whatsappMessage) {
        ctx.logger.error("Unable to parse outgoing message", message)
        continue
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
        continue
      }

      const messageId = (sendResponse as ServerSentMessageResponse)
        ?.messages?.[0]?.id
      if (messageId) {
        ctx.logger.info("Message sent successfully", {
          messageId,
          messageType: whatsappMessage._type,
        })
        continue
      }

      ctx.logger.warn(
        `Message of type ${whatsappMessage._type} could not be sent`,
        sendResponse,
      )
      startGenerator = true
    }
  } catch (error) {
    ctx.logger.error("An error occurred while sending the message", error)
  }
}
