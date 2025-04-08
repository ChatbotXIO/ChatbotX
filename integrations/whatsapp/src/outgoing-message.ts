import {
  ContentType,
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

export function* convertMessageToWhatsappMessage(
  message: MessageEntity,
): Generator<ClientMessage | null> {
  if (message.contentType === ContentType.TEXT) {
    for (const attachment of message.attachments || []) {
      switch (attachment.fileType) {
        case FileType.IMAGE:
          yield new Image(attachment.url ?? "")
          continue
        case FileType.VIDEO:
          yield new Video(attachment.url ?? "")
          continue
        case FileType.AUDIO:
          yield new Audio(attachment.url ?? "")
          continue
        default:
          yield new Document(attachment.url ?? "")
          continue
      }
    }
  } else {
    yield new Text(message.content ?? "not handled yet")
  }

  // if (attributes) {
  //   // Check message from flow
  //   switch (attributes.actionType) {
  //     case "SendText":
  //       for (const message of generateSendTextOutgoingMessages(
  //         flowVersionId,
  //         attributes,
  //         logger,
  //       )) {
  //         yield message
  //       }
  //       return
  //     case "SendImage":
  //       for (const message of generateSendImageOutgoingMessages(
  //         attributes,
  //         logger,
  //       )) {
  //         yield message
  //       }
  //       return
  //     case "SendCard":
  //       for (const message of generateSendCardOutgoingMessages(
  //         flowVersionId,
  //         attributes,
  //         logger,
  //       )) {
  //         yield message
  //       }
  //       return
  //     case "SendCarousel":
  //       for (const message of generateSendCarouselOutgoingMessages(
  //         flowVersionId,
  //         attributes,
  //         logger,
  //       )) {
  //         yield message
  //       }
  //       return
  //   }
  // }
}

export const sendOutgoingMessage = async (
  ctx: Context<WhatsappAuthValue>,
  conversation: ConversationEntity,
  message: MessageEntity,
) => {
  const whatsappClient = getWhatsappClient(ctx.auth)
  try {
    for (const whatsappMessage of convertMessageToWhatsappMessage(message)) {
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
    }
  } catch (error) {
    ctx.logger.error("An error occurred while sending the message", error)
  }
}
