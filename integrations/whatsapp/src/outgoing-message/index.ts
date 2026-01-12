import { StepType } from "@aha.chat/flow-config"
import {
  ContentType,
  type Context,
  type ConversationEntity,
  FileType,
  type MessageEntity,
  type SendFlowStepData,
} from "@aha.chat/sdk"
import { Audio, Document, Image, Text, Video } from "whatsapp-api-js/messages"
import type {
  ClientMessage,
  ServerErrorResponse,
  ServerSentMessageResponse,
} from "whatsapp-api-js/types"
import { getWhatsappClient } from "../client"
import { logger } from "../lib/logger"
import type { WhatsappAuthValue } from "../schemas"
import { convertFlowStepImage } from "./send-image"
import { convertFlowStepText } from "./send-text"

export function* convertMessageToWhatsappMessage(
  message: MessageEntity,
): Generator<ClientMessage | null> {
  if (message.contentType === ContentType.text) {
    if (message.content) {
      yield new Text(message.content)
    }

    for (const attachment of message.attachments || []) {
      switch (attachment.fileType) {
        case FileType.image:
          yield new Image(attachment.url ?? "")
          continue
        case FileType.video:
          yield new Video(attachment.url ?? "")
          continue
        case FileType.audio:
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
}

export function* convertFlowStepToWhatsappMessage(
  flowId: string,
  flowVersionId: string,
  step: SendFlowStepData,
) {
  switch (step.stepType) {
    case StepType.sendText:
      yield* convertFlowStepText(flowId, flowVersionId, step)
      break
    case StepType.sendImage:
      yield* convertFlowStepImage(flowId, flowVersionId, step)
      break
    default:
      break
  }
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
        logger.error("Unable to parse outgoing message", message)
        continue
      }

      const sendResponse = await whatsappClient.sendMessage(
        conversation.conversationAttributes.phoneNumberId as string,
        conversation.sourceId,
        whatsappMessage,
      )

      const serverError = sendResponse as ServerErrorResponse

      if (serverError?.error) {
        logger.error(
          `Failed to send message of type ${whatsappMessage._type}`,
          serverError.error,
        )
        continue
      }

      const messageId = (sendResponse as ServerSentMessageResponse)
        ?.messages?.[0]?.id
      if (messageId) {
        logger.info("Message sent successfully", {
          messageId,
          messageType: whatsappMessage._type,
        })
        continue
      }

      logger.warn(
        `Message of type ${whatsappMessage._type} could not be sent`,
        sendResponse,
      )
    }
  } catch (error) {
    logger.error("An error occurred while sending the message", error)
  }
}

export const sendFlowStep = async (
  ctx: Context<WhatsappAuthValue>,
  conversation: ConversationEntity,
  flowId: string,
  flowVersionId: string,
  step: SendFlowStepData,
) => {
  const whatsappClient = getWhatsappClient(ctx.auth)

  try {
    for (const whatsappMessage of convertFlowStepToWhatsappMessage(
      flowId,
      flowVersionId,
      step,
    )) {
      if (!whatsappMessage) {
        logger.error("Unable to parse outgoing message", step)
        continue
      }

      const sendResponse = await whatsappClient.sendMessage(
        conversation.conversationAttributes.phoneNumberId as string,
        conversation.sourceId,
        whatsappMessage,
      )

      const serverError = sendResponse as ServerErrorResponse

      if (serverError?.error) {
        logger.error(
          `Failed to send message of type ${whatsappMessage._type}`,
          serverError.error,
        )
        continue
      }

      const messageId = (sendResponse as ServerSentMessageResponse)
        ?.messages?.[0]?.id
      if (messageId) {
        logger.info("Message sent successfully", {
          messageId,
          messageType: whatsappMessage._type,
        })
        continue
      }

      logger.warn(
        `Message of type ${whatsappMessage._type} could not be sent`,
        sendResponse,
      )
    }
  } catch (error) {
    logger.error("An error occurred while sending the message", error)
  }
}
