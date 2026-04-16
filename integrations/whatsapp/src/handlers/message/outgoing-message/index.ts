import {
  type SendImageStepSchema,
  type SendTextStepSchema,
  type SendWaTemplateMessageStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import {
  contentTypes,
  type MessageHandlers,
  type OutgoingMessage,
} from "@chatbotx.io/sdk"
import { Audio, Document, Image, Text, Video } from "whatsapp-api-js/messages"
import type {
  ClientMessage,
  ServerErrorResponse,
  ServerSentMessageResponse,
} from "whatsapp-api-js/types"
import { getWhatsappClient } from "../../../client"
import { API_URL, DEFAULT_API_VERSION } from "../../../constants"
import { WhatsappException } from "../../../exception"
import { logger } from "../../../lib/logger"
import type { TemplateMessage, WhatsappAuthValue } from "../../../schema"
import { convertFlowStepImage } from "./send-image"
import { convertFlowStepText } from "./send-text"
import { convertFlowStepWaTemplate } from "./send-wa-template"

function* convertMessageToWhatsappMessage(
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

function* convertFlowStepToWhatsappMessage(
  props: Parameters<MessageHandlers<WhatsappAuthValue>["sendFlowStep"]>[0],
): Generator<ClientMessage | TemplateMessage> {
  const {
    data: { step },
  } = props
  switch (step.stepType) {
    case stepTypes.enum.sendText:
      yield* convertFlowStepText(
        props as Parameters<
          MessageHandlers<WhatsappAuthValue, SendTextStepSchema>["sendFlowStep"]
        >[0],
      )
      break
    case stepTypes.enum.sendImage:
      yield* convertFlowStepImage(
        props as Parameters<
          MessageHandlers<
            WhatsappAuthValue,
            SendImageStepSchema
          >["sendFlowStep"]
        >[0],
      )
      break
    case stepTypes.enum.sendWaTemplateMessage:
      yield* convertFlowStepWaTemplate(
        props as Parameters<
          MessageHandlers<
            WhatsappAuthValue,
            SendWaTemplateMessageStepSchema
          >["sendFlowStep"]
        >[0],
      )
      break
    default:
      break
  }
}

export const sendMessage: MessageHandlers<WhatsappAuthValue>["sendMessage"] =
  async (props) => {
    const {
      ctx,
      data: { contact, message },
    } = props
    const whatsappClient = getWhatsappClient(ctx.auth)

    try {
      for (const whatsappMessage of convertMessageToWhatsappMessage(message)) {
        if (!whatsappMessage) {
          logger.error(message, "Unable to parse outgoing message")
          continue
        }

        const sendResponse = await whatsappClient.sendMessage(
          ctx.auth.metadata.phoneNumber.id,
          contact.sourceId,
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
      throw error
    }

    return {
      messageIds: [],
    }
  }

export const sendFlowStep: MessageHandlers<WhatsappAuthValue>["sendFlowStep"] =
  async (props) => {
    const {
      ctx,
      data: { step, contact },
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

        if (
          "_type" in whatsappMessage &&
          whatsappMessage._type === "template"
        ) {
          const templateMessage = whatsappMessage as TemplateMessage
          const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: contact.sourceId,
            type: "template",
            template: templateMessage.template,
          }

          const response = await whatsappClient.$$apiFetch$$(
            `${API_URL}/${DEFAULT_API_VERSION}/${ctx.auth.metadata.phoneNumber.id}/messages`,
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
            ctx.auth.metadata.phoneNumber.id,
            contact.sourceId,
            whatsappMessage,
          )
        }

        const serverError = sendResponse as ServerErrorResponse

        if (serverError?.error) {
          throw new WhatsappException(serverError.error.message).setOriginError(
            {
              response: {
                error: serverError.error,
              },
            },
          )
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
      throw error
    }

    return { messageIds }
  }
