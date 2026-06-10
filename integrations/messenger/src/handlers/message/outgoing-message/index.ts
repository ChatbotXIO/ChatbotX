import {
  type SendAudioStepSchema,
  type SendCarouselStepSchema,
  type SendFileStepSchema,
  type SendImageStepSchema,
  type SendMessengerTemplateMessageStepSchema,
  type SendQuickReplyStepSchema,
  type SendTextStepSchema,
  type SendVideoStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import {
  ChannelError,
  ChannelErrorCategory,
  contentTypes,
  type MessageHandlers,
  type OutgoingContact,
  type OutgoingMessage,
  type SendFlowStepProps,
} from "@chatbotx.io/sdk"
import { sendPageMessage } from "../../../apis/message"
import { mapToChannelError } from "../../../lib/error-mapper"
import { logger } from "../../../lib/logger"
import {
  type FacebookMessage,
  type FacebookMessageAttachmentPayload,
  type FacebookSendMessageRequest,
  MESSENGER_MESSAGE_METADATA,
  type MessengerAuthValue,
  type MessengerIntegrationDetail,
} from "../../../schema"
import { getAttachmentTemplate } from "./send-attachment"
import { convertFlowStepCarousel } from "./send-carousel"
import { convertFlowStepFile } from "./send-file"
import { convertFlowStepGif } from "./send-gif"
import { convertFlowStepMedia } from "./send-media"
import { buildMessengerTemplateSendRequest } from "./send-messenger-template"
import { convertFlowStepQuickReply } from "./send-quick-reply"
import { convertFlowStepText } from "./send-text"

const RESPONSE_WINDOW_MS = 24 * 60 * 60 * 1000
const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

type MessengerMessagingPolicy = {
  messagingType: "MESSAGE_TAG" | "RESPONSE"
  tag?: FacebookSendMessageRequest["tag"]
}

export const sendMessage: MessageHandlers<MessengerAuthValue>["sendMessage"] =
  async (props) => {
    const {
      ctx,
      data: { contact, message, sendFrom },
    } = props

    try {
      const policy = resolveMessengerMessagingPolicy({ contact, sendFrom })
      for (const facebookMessage of convertMessageToFacebookMessage(message)) {
        const payload = buildMessagePayload({
          contact,
          message: facebookMessage,
          ...policy,
          personaId: (ctx.integrationDetail as MessengerIntegrationDetail)
            .personaId,
        })
        await sendPageMessage(ctx.auth, payload)
        logger.info(`Message sent for PSID: ${contact.sourceId}`)
      }
    } catch (error) {
      logger.error(error, "An error occurred while sending the message")
      throw mapToChannelError(error)
    }

    return {
      messageIds: [],
    }
  }

export const sendFlowStep: MessageHandlers<MessengerAuthValue>["sendFlowStep"] =
  async (props: SendFlowStepProps<MessengerAuthValue>) => {
    const {
      ctx,
      data: { contact, sendFrom, step },
    } = props
    try {
      // Messenger utility templates must be sent as a complete Send API request
      // using message.template (name/language/components) — they cannot go through
      // the generic buildMessagePayload spread, which is for plain messages.
      if (step.stepType === stepTypes.enum.sendMessengerTemplateMessage) {
        const payload = buildMessengerTemplateSendRequest(
          props as SendFlowStepProps<
            MessengerAuthValue,
            SendMessengerTemplateMessageStepSchema
          >,
        )
        await sendPageMessage(ctx.auth, payload)
        logger.info(`Messenger template sent for PSID: ${contact.sourceId}`)
        return { messageIds: [] }
      }

      const policy = resolveMessengerMessagingPolicy({ contact, sendFrom })
      for await (const facebookMessage of convertFlowStepToFacebookMessage(
        props,
      )) {
        await sendPageMessage(
          ctx.auth,
          buildMessagePayload({
            contact,
            message: facebookMessage,
            ...policy,
            personaId: (ctx.integrationDetail as MessengerIntegrationDetail)
              .personaId,
          }),
        )
        logger.info(`Message sent for PSID: ${contact.sourceId}`)
      }
    } catch (error) {
      logger.error(error, "An error occurred while sending the message")
      throw mapToChannelError(error)
    }

    return {
      messageIds: [],
    }
  }

function* convertMessageToFacebookMessage(
  message: OutgoingMessage,
): Generator<FacebookMessage> {
  if (message.contentType === contentTypes.enum.text) {
    if (message.text) {
      yield {
        text: message.text,
      }
    }
    for (const attachment of message.attachments || []) {
      switch (attachment.fileType) {
        case "image":
          yield {
            attachment: getAttachmentTemplate(
              attachment.url as string,
              "image",
            ),
          }
          continue
        case "video":
          yield {
            attachment: getAttachmentTemplate(
              attachment.url as string,
              "video",
            ),
          }
          continue
        case "audio":
          yield {
            attachment: getAttachmentTemplate(
              attachment.url as string,
              "audio",
            ),
          }
          continue
        default:
          yield {
            attachment: getAttachmentTemplate(attachment.url as string, "file"),
          }
          continue
      }
    }
  } else {
    yield {
      text: message.text ?? "not handled yet",
    }
  }
}

const buildMessagePayload = (props: {
  contact: OutgoingContact
  message: FacebookMessageAttachmentPayload | FacebookMessage
  messagingType?: "MESSAGE_TAG" | "RESPONSE"
  tag?: FacebookSendMessageRequest["tag"]
  personaId?: string
}): FacebookSendMessageRequest => {
  const { contact, message, messagingType = "RESPONSE", personaId, tag } = props

  return {
    recipient: { id: contact.sourceId },
    message: {
      ...message,
      metadata: MESSENGER_MESSAGE_METADATA,
    },
    messaging_type: messagingType,
    tag,
    persona_id: personaId,
  }
}

export function resolveMessengerMessagingPolicy(props: {
  contact: OutgoingContact
  now?: Date | number
  sendFrom?: "inbox"
}): MessengerMessagingPolicy {
  const { contact, sendFrom } = props

  if (sendFrom !== "inbox") {
    return { messagingType: "RESPONSE" }
  }

  const lastIncomingMessageAt = normalizeLastIncomingMessageAt(
    contact.lastIncomingMessageAt,
  )

  if (!lastIncomingMessageAt) {
    return { messagingType: "RESPONSE" }
  }

  let nowMs = Date.now()
  if (props.now instanceof Date) {
    nowMs = props.now.getTime()
  } else if (typeof props.now === "number") {
    nowMs = props.now
  }
  const elapsedMs = nowMs - lastIncomingMessageAt.getTime()

  if (elapsedMs <= RESPONSE_WINDOW_MS) {
    return { messagingType: "RESPONSE" }
  }

  if (elapsedMs <= HUMAN_AGENT_WINDOW_MS) {
    return { messagingType: "MESSAGE_TAG", tag: "HUMAN_AGENT" }
  }

  throw new ChannelError(
    "Cannot send a Messenger inbox message more than 7 days after the last incoming message",
    ChannelErrorCategory.PAYLOAD_INVALID,
    { code: "messenger_human_agent_window_expired" },
  )
}

function normalizeLastIncomingMessageAt(
  value: Date | string | null | undefined,
) {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

async function* convertFlowStepToFacebookMessage(
  props: SendFlowStepProps<MessengerAuthValue>,
): AsyncGenerator<FacebookMessageAttachmentPayload | FacebookMessage> {
  const {
    data: { step },
  } = props

  switch (step.stepType) {
    case stepTypes.enum.sendText:
      yield* convertFlowStepText(
        props as SendFlowStepProps<MessengerAuthValue, SendTextStepSchema>,
      ) as Generator<FacebookMessageAttachmentPayload | FacebookMessage>
      break
    case stepTypes.enum.sendImage:
    case stepTypes.enum.sendVideo:
      await (yield* convertFlowStepMedia(
        props as SendFlowStepProps<
          MessengerAuthValue,
          SendImageStepSchema | SendVideoStepSchema
        >,
      ))
      break
    case stepTypes.enum.sendAudio:
    case stepTypes.enum.sendFile:
      await (yield* convertFlowStepFile(
        props as SendFlowStepProps<
          MessengerAuthValue,
          SendAudioStepSchema | SendFileStepSchema
        >,
      ))
      break
    case stepTypes.enum.sendGif:
      yield* convertFlowStepGif(step.url) as Generator<FacebookMessage>
      break
    case stepTypes.enum.sendQuickReply:
      yield* convertFlowStepQuickReply(
        props as SendFlowStepProps<
          MessengerAuthValue,
          SendQuickReplyStepSchema
        >,
      ) as Generator<FacebookMessage>
      break
    case stepTypes.enum.sendCarousel:
      yield* convertFlowStepCarousel(
        props as SendFlowStepProps<MessengerAuthValue, SendCarouselStepSchema>,
      ) as Generator<FacebookMessage>
      break
    default:
      break
  }
}
