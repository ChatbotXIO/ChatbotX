import {
  type SendCarouselStepSchema,
  type SendImageStepSchema,
  type SendTextStepSchema,
  type SendWaTemplateMessageStepSchema,
  stepTypes,
  type WhatsappCallButtonStepSchema,
  type WhatsappFlowStepSchema,
  type WhatsappOptionListStepSchema,
} from "@chatbotx.io/flow-config"
import {
  contentTypes,
  getWhatsappCallPermissionRequest,
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
import { mapToChannelError } from "../../../lib/error-mapper"
import { logger } from "../../../lib/logger"
import {
  isBsuidRecipient,
  resolveRecipientParams,
} from "../../../lib/recipient"
import type { RawWhatsappMessage, WhatsappAuthValue } from "../../../schema"
import { generateOutgoingMessages as convertFlowStepCarousel } from "./send-carousel"
import { convertFlowStepImage } from "./send-image"
import { convertFlowStepText } from "./send-text"
import { convertFlowStepWaTemplate } from "./send-wa-template"
import { convertFlowStepWhatsappCallButton } from "./whatsapp-call-button"
import { convertFlowStepWhatsappFlow } from "./whatsapp-flow"
import { convertFlowStepWhatsappOptionList } from "./whatsapp-option-list"

function* convertMessageToWhatsappMessage(
  message: OutgoingMessage,
): Generator<ClientMessage | RawWhatsappMessage | null> {
  // A permission-request message renders as Meta's call_permission_request
  // interactive with the message text as its body — never as plain text.
  if (
    getWhatsappCallPermissionRequest(message.contentAttributes) &&
    message.text
  ) {
    yield {
      _type: "interactive_call_permission_request",
      type: "interactive",
      interactive: {
        type: "call_permission_request",
        body: { text: message.text },
        action: { name: "call_permission_request" },
      },
    }
    return
  }

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
        contactInboxId: carouselStepProps.data.contact.id,
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
    case stepTypes.enum.whatsappCallButton:
      yield* convertFlowStepWhatsappCallButton(
        props as Parameters<
          MessageHandlers<
            WhatsappAuthValue,
            WhatsappCallButtonStepSchema
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

/** `whatsapp-api-js` models none of these payloads, so they're posted as-is. */
const isRawWhatsappMessage = (
  message: ClientMessage | RawWhatsappMessage,
): message is RawWhatsappMessage =>
  message._type === "template" ||
  message._type === "interactive_carousel" ||
  message._type === "interactive_voice_call" ||
  message._type === "interactive_call_permission_request"

/**
 * Builds the Cloud API message-body fields (everything after
 * `messaging_product`/`recipient_type`/recipient params). `RawWhatsappMessage`
 * shapes already carry `type`/`<type>` as their own top-level fields, so they
 * spread as-is. A plain `ClientMessage` instance (e.g. `Text`) does not — its
 * own fields ARE the type-specific payload — so it's wrapped as
 * `{ type: msg._type, [msg._type]: msg }`, matching what
 * `whatsapp-api-js`'s lib sender builds internally. This is the shape a
 * BSUID-keyed lib-path send is routed through here instead (D4: the library
 * cannot emit `recipient`).
 */
const toRawMessageBody = (
  message: ClientMessage | RawWhatsappMessage,
): Record<string, unknown> => {
  if (isRawWhatsappMessage(message)) {
    const { _type, ...messageBody } = message
    return messageBody
  }
  return { type: message._type, [message._type]: message }
}

async function postRawMessage(props: {
  client: ReturnType<typeof getWhatsappClient>
  phoneNumberId: string
  recipientParams: ReturnType<typeof resolveRecipientParams>
  message: ClientMessage | RawWhatsappMessage
}): Promise<ServerErrorResponse | ServerSentMessageResponse> {
  const messageBody = toRawMessageBody(props.message)
  logger.debug(
    {
      phoneId: props.phoneNumberId,
      recipientMode: "recipient" in props.recipientParams ? "recipient" : "to",
      messageType: props.message._type,
    },
    "postRawMessage",
  )
  const response = await props.client.$$apiFetch$$(
    `${API_URL}/${DEFAULT_API_VERSION}/${props.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        ...props.recipientParams,
        ...messageBody,
      }),
    },
  )

  if (!response.ok) {
    const errorBody = await response.json()
    logger.error(errorBody, `Failed to send ${props.message._type} message`)
    // Pass the HTTP status alongside Meta's raw body so the mapper surfaces the
    // real error code and detail instead of collapsing to an "unknown" (-1).
    throw mapToChannelError({
      httpStatus: response.status,
      errorBody: errorBody as { error?: unknown },
    })
  }

  return await response.json()
}

export const sendMessage: MessageHandlers<WhatsappAuthValue>["sendMessage"] =
  async (props) => {
    const {
      ctx,
      data: { contact, message },
    } = props
    const whatsappClient = getWhatsappClient(ctx.auth)
    const messageIds: string[] = []
    const recipientParams = resolveRecipientParams(contact)
    const isBsuidKeyedRecipient = isBsuidRecipient(recipientParams)

    try {
      for (const whatsappMessage of convertMessageToWhatsappMessage(message)) {
        if (!whatsappMessage) {
          logger.error(message, "Unable to parse outgoing message")
          continue
        }

        logger.debug(
          {
            phoneId: ctx.auth.metadata.phoneNumber.id,
            recipientMode: isBsuidKeyedRecipient ? "recipient" : "to",
            messageType: whatsappMessage._type,
          },
          "sendMessage: dispatching outgoing message",
        )
        // Raw payloads (unmodeled by whatsapp-api-js) must bypass the lib
        // sender for every recipient, not just BSUID-keyed ones — mirrors
        // sendFlowStep below.
        const sendResponse =
          isRawWhatsappMessage(whatsappMessage) || isBsuidKeyedRecipient
            ? await postRawMessage({
                client: whatsappClient,
                phoneNumberId: ctx.auth.metadata.phoneNumber.id,
                recipientParams,
                message: whatsappMessage,
              })
            : await whatsappClient.sendMessage(
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
          throw mapToChannelError(serverError.error)
        }

        const messageId = (sendResponse as ServerSentMessageResponse)
          ?.messages?.[0]?.id
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
    const recipientParams = resolveRecipientParams(contact)
    const isBsuidKeyedRecipient = isBsuidRecipient(recipientParams)

    try {
      for (const whatsappMessage of convertFlowStepToWhatsappMessage(props)) {
        if (!whatsappMessage) {
          logger.error(step, "Unable to parse outgoing message")
          continue
        }

        let sendResponse: ServerErrorResponse | ServerSentMessageResponse

        if (isRawWhatsappMessage(whatsappMessage) || isBsuidKeyedRecipient) {
          sendResponse = await postRawMessage({
            client: whatsappClient,
            phoneNumberId: ctx.auth.metadata.phoneNumber.id,
            recipientParams,
            message: whatsappMessage,
          })
        } else {
          logger.debug(
            {
              phoneId: ctx.auth.metadata.phoneNumber.id,
              recipientMode: isBsuidKeyedRecipient ? "recipient" : "to",
              messageType: whatsappMessage._type,
            },
            "sendFlowStep: dispatching outgoing message",
          )
          sendResponse = await whatsappClient.sendMessage(
            ctx.auth.metadata.phoneNumber.id,
            contact.sourceId,
            whatsappMessage,
          )
        }
        const serverError = sendResponse as ServerErrorResponse

        if (serverError?.error) {
          throw mapToChannelError(serverError.error)
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
      throw mapToChannelError(error)
    }

    return { messageIds }
  }
