import {
  type SendImageStepSchema,
  type SendTextStepSchema,
  StepType,
} from "@aha.chat/flow-config"
import {
  ContentType,
  type OutgoingMessage,
  type SendFlowStepProps,
  type SendMessageProps,
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
  message: OutgoingMessage,
): Generator<ClientMessage | null> {
  if (message.contentType === ContentType.text) {
    if (message.content) {
      yield new Text(message.content)
    }

    for (const attachment of message.attachments || []) {
      switch (attachment.fileType) {
        case "image":
          yield new Image(attachment.url ?? "")
          continue
        case "video":
          yield new Video(attachment.url ?? "")
          continue
        case "audio":
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
  props: SendFlowStepProps<WhatsappAuthValue>,
) {
  const {
    data: { step },
  } = props
  switch (step.stepType) {
    case StepType.sendText:
      yield* convertFlowStepText(
        props as SendFlowStepProps<WhatsappAuthValue, SendTextStepSchema>,
      )
      break
    case StepType.sendImage:
      yield* convertFlowStepImage(
        props as SendFlowStepProps<WhatsappAuthValue, SendImageStepSchema>,
      )
      break
    default:
      break
  }
}

export const sendMessage = async (
  props: SendMessageProps<WhatsappAuthValue>,
) => {
  const {
    ctx,
    data: { conversation, message },
  } = props
  const whatsappClient = getWhatsappClient(ctx.auth)

  try {
    for (const whatsappMessage of convertMessageToWhatsappMessage(message)) {
      if (!whatsappMessage) {
        logger.error(message, "Unable to parse outgoing message")
        continue
      }

      const sendResponse = await whatsappClient.sendMessage(
        (conversation.conversationAttributes as { phoneNumberId: string })
          .phoneNumberId,
        conversation.sourceId as string,
        whatsappMessage,
      )

      const serverError = sendResponse as ServerErrorResponse

      if (serverError?.error) {
        logger.error(
          serverError.error,
          `Failed to send message of type ${whatsappMessage._type}`,
        )
        continue
      }

      const messageId = (sendResponse as ServerSentMessageResponse)
        ?.messages?.[0]?.id
      if (messageId) {
        logger.info(
          {
            messageId,
            messageType: whatsappMessage._type,
          },
          "Message sent successfully",
        )
        continue
      }

      logger.warn(
        sendResponse,
        `Message of type ${whatsappMessage._type} could not be sent`,
      )
    }
  } catch (error) {
    logger.error(error, "An error occurred while sending the message")
  }
}

export const sendFlowStep = async (
  props: SendFlowStepProps<WhatsappAuthValue>,
) => {
  const {
    ctx,
    data: { conversation, step },
  } = props
  const whatsappClient = getWhatsappClient(ctx.auth)

  try {
    for (const whatsappMessage of convertFlowStepToWhatsappMessage(props)) {
      if (!whatsappMessage) {
        logger.error(step, "Unable to parse outgoing message")
        continue
      }

      const sendResponse = await whatsappClient.sendMessage(
        (conversation.conversationAttributes as { phoneNumberId: string })
          .phoneNumberId,
        conversation.sourceId as string,
        whatsappMessage,
      )

      const serverError = sendResponse as ServerErrorResponse

      if (serverError?.error) {
        logger.error(
          serverError.error,
          `Failed to send message of type ${whatsappMessage._type}`,
        )
        continue
      }

      const messageId = (sendResponse as ServerSentMessageResponse)
        ?.messages?.[0]?.id
      if (messageId) {
        logger.info(
          {
            messageId,
            messageType: whatsappMessage._type,
          },
          "Message sent successfully",
        )
        continue
      }

      logger.warn(
        sendResponse,
        `Message of type ${whatsappMessage._type} could not be sent`,
      )
    }
  } catch (error) {
    logger.error(error, "An error occurred while sending the message")
  }
}
