import {
  type SendCarouselStepSchema,
  type SendImageStepSchema,
  type SendTextStepSchema,
  type SendWaTemplateMessageStepSchema,
  stepTypes,
  type WhatsappFlowStepSchema,
  type WhatsappOptionListStepSchema,
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
import { z } from "zod"
import { getWhatsappClient } from "../../../client"
import { API_URL, DEFAULT_API_VERSION } from "../../../constants"
import { mapToChannelError } from "../../../lib/error-mapper"
import { logger } from "../../../lib/logger"
import type { RawWhatsappMessage, WhatsappAuthValue } from "../../../schema"
import { generateOutgoingMessages as convertFlowStepCarousel } from "./send-carousel"
import { convertFlowStepImage } from "./send-image"
import { convertFlowStepText } from "./send-text"
import { convertFlowStepWaTemplate } from "./send-wa-template"
import { convertFlowStepWhatsappFlow } from "./whatsapp-flow"
import { convertFlowStepWhatsappOptionList } from "./whatsapp-option-list"

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
): Generator<ClientMessage | RawWhatsappMessage> {
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
    case stepTypes.enum.sendCarousel: {
      const carouselStepProps = props as Parameters<
        MessageHandlers<
          WhatsappAuthValue,
          SendCarouselStepSchema
        >["sendFlowStep"]
      >[0]

      yield* convertFlowStepCarousel({
        flowId: carouselStepProps.data.flowId,
        flowVersionId: carouselStepProps.data.flowVersionId,
        metadata: carouselStepProps.data.metadata,
        quickReplies: carouselStepProps.data.quickReplies,
        payload: {
          cards: carouselStepProps.data.step.cards,
        },
      })
      break
    }
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
    case stepTypes.enum.whatsappOptionList:
      yield* convertFlowStepWhatsappOptionList(
        props as Parameters<
          MessageHandlers<
            WhatsappAuthValue,
            WhatsappOptionListStepSchema
          >["sendFlowStep"]
        >[0],
      )
      break
    case stepTypes.enum.whatsappFlow:
      yield* convertFlowStepWhatsappFlow(
        props as Parameters<
          MessageHandlers<
            WhatsappAuthValue,
            WhatsappFlowStepSchema
          >["sendFlowStep"]
        >[0],
      )
      break
    default:
      break
  }
}

const rawWhatsappSuccessResponseSchema = z
  .object({
    error: z.never().optional(),
    messages: z
      .array(
        z
          .object({
            id: z.string().min(1),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough()

type RawWhatsappSuccessResponse = z.infer<
  typeof rawWhatsappSuccessResponseSchema
>

type WhatsappSendResponse =
  | RawWhatsappSuccessResponse
  | ServerErrorResponse
  | ServerSentMessageResponse

const getServerError = (
  response: WhatsappSendResponse,
): ServerErrorResponse["error"] | undefined =>
  "error" in response ? response.error : undefined

const getProviderMessageId = (
  response: WhatsappSendResponse,
): string | undefined =>
  "messages" in response ? response.messages[0]?.id : undefined

const rawWhatsappErrorBodySchema = z
  .object({ error: z.unknown().optional() })
  .passthrough()

const rawMessagePayloadBuilders: Record<
  RawWhatsappMessage["_type"],
  (message: RawWhatsappMessage, recipientId: string) => Record<string, unknown>
> = {
  interactive_carousel: (message, recipientId) => ({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipientId,
    type: message.type,
    ...("interactive" in message ? { interactive: message.interactive } : {}),
  }),
  template: (message, recipientId) => ({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipientId,
    type: message.type,
    ...("template" in message ? { template: message.template } : {}),
  }),
}

const isRawWhatsappMessage = (
  message: ClientMessage | RawWhatsappMessage,
): message is RawWhatsappMessage =>
  Object.hasOwn(rawMessagePayloadBuilders, message._type)

async function postRawMessage(props: {
  client: ReturnType<typeof getWhatsappClient>
  phoneNumberId: string
  recipientId: string
  message: RawWhatsappMessage
}): Promise<RawWhatsappSuccessResponse> {
  const payload = rawMessagePayloadBuilders[props.message._type](
    props.message,
    props.recipientId,
  )
  const response = await props.client.$$apiFetch$$(
    `${API_URL}/${DEFAULT_API_VERSION}/${props.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  )
  const responseBody: unknown = await response.json()

  if (!response.ok) {
    const errorBody = rawWhatsappErrorBodySchema.parse(responseBody)
    const providerError = errorBody.error ?? errorBody
    logger.error(
      { err: providerError, messageType: props.message._type },
      "Failed to send raw WhatsApp message",
    )
    throw mapToChannelError(providerError)
  }

  return rawWhatsappSuccessResponseSchema.parse(responseBody)
}

export const sendMessage: MessageHandlers<WhatsappAuthValue>["sendMessage"] =
  async (props) => {
    const {
      ctx,
      data: { contact, message },
    } = props
    const whatsappClient = getWhatsappClient(ctx.auth)
    const messageIds: string[] = []

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

        const serverError = getServerError(sendResponse)

        if (serverError) {
          logger.error(
            serverError,
            `Failed to send message of type ${whatsappMessage._type}`,
          )
          throw mapToChannelError(serverError)
        }

        const messageId = getProviderMessageId(sendResponse)
        if (messageId) {
          messageIds.push(messageId)
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
      throw mapToChannelError(error)
    }

    // Return the provider message id(s) so the worker can persist messageIds[0]
    // as the Message row's sourceId (coexist echo dedup — see sendFlowStep).
    return {
      messageIds,
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

        let sendResponse: WhatsappSendResponse

        if (isRawWhatsappMessage(whatsappMessage)) {
          sendResponse = await postRawMessage({
            client: whatsappClient,
            phoneNumberId: ctx.auth.metadata.phoneNumber.id,
            recipientId: contact.sourceId,
            message: whatsappMessage,
          })
        } else {
          sendResponse = await whatsappClient.sendMessage(
            ctx.auth.metadata.phoneNumber.id,
            contact.sourceId,
            whatsappMessage,
          )
        }

        const serverError = getServerError(sendResponse)

        if (serverError) {
          throw mapToChannelError(serverError)
        }

        const messageId = getProviderMessageId(sendResponse)
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
      throw mapToChannelError(error)
    }

    return { messageIds }
  }
