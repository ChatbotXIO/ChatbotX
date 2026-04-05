import {
  type SendImageStepSchema,
  type SendTextStepSchema,
  type SendWaTemplateMessageStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import {
  contentTypes,
  type OutgoingMessage,
  type SendFlowStepProps,
  type SendMessageProps,
} from "@chatbotx.io/sdk"
import { Audio, Document, Image, Text, Video } from "whatsapp-api-js/messages"
import type {
  ClientMessage,
  ServerErrorResponse,
  ServerSentMessageResponse,
} from "whatsapp-api-js/types"
import { getWhatsappClient } from "../client"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { logger } from "../lib/logger"
import type { TemplateMessage, WhatsappAuthValue } from "../schemas"
import { convertFlowStepImage } from "./send-image"
import { convertFlowStepText } from "./send-text"
import { convertFlowStepWaTemplate } from "./send-wa-template"

export function* convertMessageToWhatsappMessage(
  message: OutgoingMessage,
): Generator<ClientMessage | null> {
  if (message.contentType === contentTypes.enum.text) {
    if (message.text) {
      yield new Text(message.text)
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
    yield new Text(message.text ?? "not handled yet")
  }
}

export function* convertFlowStepToWhatsappMessage(
  props: SendFlowStepProps<WhatsappAuthValue>,
): Generator<ClientMessage | TemplateMessage> {
  const {
    data: { step },
  } = props
  switch (step.stepType) {
    case stepTypes.enum.sendText:
      yield* convertFlowStepText(
        props as SendFlowStepProps<WhatsappAuthValue, SendTextStepSchema>,
      )
      break
    case stepTypes.enum.sendImage:
      yield* convertFlowStepImage(
        props as SendFlowStepProps<WhatsappAuthValue, SendImageStepSchema>,
      )
      break
    case stepTypes.enum.sendWaTemplateMessage:
      yield* convertFlowStepWaTemplate(
        props as SendFlowStepProps<
          WhatsappAuthValue,
          SendWaTemplateMessageStepSchema
        >,
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
    data: { conversation, message, contactInbox },
  } = props
  const whatsappClient = getWhatsappClient(ctx.auth)

  try {
    for (const whatsappMessage of convertMessageToWhatsappMessage(message)) {
      if (!whatsappMessage) {
        logger.error(message, "Unable to parse outgoing message")
        continue
      }

      const sendResponse = await whatsappClient.sendMessage(
        (conversation.additionalAttributes as { phoneNumberId: string })
          .phoneNumberId,
        contactInbox.sourceId,
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
): Promise<{ messageId?: string; messageIds?: string[] }> => {
  const {
    ctx,
    data: { conversation, step, contactInbox },
  } = props
  const whatsappClient = getWhatsappClient(ctx.auth)
  const messageIds: string[] = []

  try {
    for (const whatsappMessage of convertFlowStepToWhatsappMessage(props)) {
      if (!whatsappMessage) {
        logger.error(step, "Unable to parse outgoing message")
        continue
      }

      let sendResponse: ServerErrorResponse | ServerSentMessageResponse

      if ("_type" in whatsappMessage && whatsappMessage._type === "template") {
        const templateMessage = whatsappMessage as TemplateMessage
        const payload = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: contactInbox.sourceId,
          type: "template",
          template: templateMessage.template,
        }

        const response = await whatsappClient.$$apiFetch$$(
          `${API_URL}/${DEFAULT_API_VERSION}/${conversation.additionalAttributes?.phoneNumberId}/messages`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        )

        if (!response.ok) {
          const errorBody = await response.json()
          logger.error(errorBody, "Failed to send template message")
          continue
        }

        sendResponse = await response.json()
      } else {
        sendResponse = await whatsappClient.sendMessage(
          conversation.additionalAttributes?.phoneNumberId as string,
          contactInbox.sourceId,
          whatsappMessage,
        )
      }

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
        messageIds.push(messageId)
      } else {
        logger.warn(
          sendResponse,
          `Message of type ${whatsappMessage._type} could not be sent`,
        )
      }
    }
  } catch (error) {
    logger.error(error, "An error occurred while sending the message")
  }

  return { messageIds }
}
