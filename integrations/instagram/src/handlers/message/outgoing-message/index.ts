import {
  type SendAudioStepSchema,
  type SendCarouselStepSchema,
  type SendFileStepSchema,
  type SendImageStepSchema,
  type SendQuickReplyStepSchema,
  type SendTextStepSchema,
  type SendVideoStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import {
  ChannelError,
  ChannelErrorCategory,
  contentTypes,
  META_HUMAN_AGENT_WINDOW_MS,
  META_RESPONSE_WINDOW_MS,
  type MessageHandlers,
  normalizeLastIncomingMessageAt,
  type OutgoingContact,
  type OutgoingMessage,
  type SendFlowStepProps,
} from "@chatbotx.io/sdk"
import { sendInstagramMessage } from "../../../apis/page"
import { mapToChannelError } from "../../../lib/error-mapper"
import { logger } from "../../../lib/logger"
import {
  INSTAGRAM_MESSAGE_METADATA,
  type InstagramAuthValue,
  type InstagramMessageAttachmentPayload,
  type InstagramSendMessage,
  type InstagramSendMessageRequest,
} from "../../../schemas"
import { getAttachmentTemplate } from "./send-attachment"
import { convertFlowStepCarousel } from "./send-carousel"
import { convertFlowStepFile } from "./send-file"
import { convertFlowStepGif } from "./send-gif"
import { convertFlowStepMedia } from "./send-media"
import { convertFlowStepQuickReply } from "./send-quick-reply"
import { convertFlowStepText } from "./send-text"

type InstagramMessagingPolicy = {
  messagingType: "MESSAGE_TAG" | "RESPONSE"
  tag?: "HUMAN_AGENT"
}

export function resolveInstagramMessagingPolicy(props: {
  contact: OutgoingContact
  now?: Date | number
  sendFrom?: "inbox"
}): InstagramMessagingPolicy {
  const { contact, sendFrom } = props

  const lastIncomingMessageAt = normalizeLastIncomingMessageAt(
    contact.lastIncomingMessageAt,
  )

  let nowMs = Date.now()
  if (props.now instanceof Date) {
    nowMs = props.now.getTime()
  } else if (typeof props.now === "number") {
    nowMs = props.now
  }

  if (sendFrom !== "inbox") {
    if (lastIncomingMessageAt) {
      const elapsedMs = nowMs - lastIncomingMessageAt.getTime()
      if (elapsedMs > META_RESPONSE_WINDOW_MS) {
        throw new ChannelError(
          "Cannot send an Instagram automated message outside the 24-hour response window",
          ChannelErrorCategory.PAYLOAD_INVALID,
          { code: "instagram_response_window_expired" },
        )
      }
    }
    return { messagingType: "RESPONSE" }
  }

  if (!lastIncomingMessageAt) {
    return { messagingType: "RESPONSE" }
  }

  const elapsedMs = nowMs - lastIncomingMessageAt.getTime()

  if (elapsedMs <= META_RESPONSE_WINDOW_MS) {
    return { messagingType: "RESPONSE" }
  }

  if (elapsedMs <= META_HUMAN_AGENT_WINDOW_MS) {
    return { messagingType: "MESSAGE_TAG", tag: "HUMAN_AGENT" }
  }

  throw new ChannelError(
    "Cannot send an Instagram inbox message more than 7 days after the last incoming message",
    ChannelErrorCategory.PAYLOAD_INVALID,
    { code: "instagram_human_agent_window_expired" },
  )
}

export const sendMessage: MessageHandlers<InstagramAuthValue>["sendMessage"] =
  async (props) => {
    const {
      ctx,
      data: { contact, message, sendFrom },
    } = props

    const policy = resolveInstagramMessagingPolicy({ contact, sendFrom })
    const messageIds: string[] = []
    try {
      for (const instagramMessage of convertMessageToInstagramMessage(
        message,
      )) {
        const payload = buildMessagePayload(contact, instagramMessage, policy)
        const response = await sendInstagramMessage(ctx.auth, payload)
        if (response.message_id) {
          messageIds.push(response.message_id)
        }
        logger.info(`Message sent for IGSID: ${contact.sourceId}`)
      }
    } catch (error) {
      logger.error(error, "An error occurred while sending the message")
      throw mapToChannelError(error)
    }

    // Return the Send API message id(s). The worker persists messageIds[0] as
    // the Message row's sourceId so the Instagram message_echo (coexist) dedups
    // against this row instead of inserting a duplicate.
    return {
      messageIds,
    }
  }

export function* convertMessageToInstagramMessage(
  message: OutgoingMessage,
): Generator<InstagramSendMessage> {
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

const buildMessagePayload = (
  contact: OutgoingContact,
  message: InstagramMessageAttachmentPayload | InstagramSendMessage,
  policy?: InstagramMessagingPolicy,
): InstagramSendMessageRequest => {
  const recipientId = contact.sourceId

  if (!recipientId) {
    throw new Error("Missing recipient ID in conversation")
  }

  return {
    recipient: { id: recipientId },
    message: {
      ...message,
      metadata: INSTAGRAM_MESSAGE_METADATA,
    },
    messaging_type: policy?.messagingType,
    tag: policy?.tag,
  }
}

export async function* convertFlowStepToInstagramMessage(
  props: SendFlowStepProps<InstagramAuthValue>,
): AsyncGenerator<InstagramMessageAttachmentPayload | InstagramSendMessage> {
  const {
    data: { step },
  } = props

  switch (step.stepType) {
    case stepTypes.enum.sendText:
      yield* convertFlowStepText(
        props as SendFlowStepProps<InstagramAuthValue, SendTextStepSchema>,
      ) as Generator<InstagramMessageAttachmentPayload | InstagramSendMessage>
      break
    case stepTypes.enum.sendImage:
    case stepTypes.enum.sendVideo:
      yield* convertFlowStepMedia(
        props as SendFlowStepProps<
          InstagramAuthValue,
          SendImageStepSchema | SendVideoStepSchema
        >,
      )
      break
    case stepTypes.enum.sendAudio:
    case stepTypes.enum.sendFile:
      await (yield* convertFlowStepFile(
        props as SendFlowStepProps<
          InstagramAuthValue,
          SendAudioStepSchema | SendFileStepSchema
        >,
      ))
      break
    case stepTypes.enum.sendGif:
      yield* convertFlowStepGif(
        step.url,
        props.data.quickReplies ?? [],
      ) as Generator<InstagramSendMessage>
      break
    case stepTypes.enum.sendQuickReply:
      yield* convertFlowStepQuickReply(
        props as SendFlowStepProps<
          InstagramAuthValue,
          SendQuickReplyStepSchema
        >,
      ) as Generator<InstagramSendMessage>
      break
    case stepTypes.enum.sendCarousel:
      yield* convertFlowStepCarousel(
        props as SendFlowStepProps<InstagramAuthValue, SendCarouselStepSchema>,
      ) as Generator<InstagramSendMessage>
      break
    default:
      break
  }
}

export const sendFlowStep = async (
  props: SendFlowStepProps<InstagramAuthValue>,
) => {
  const {
    ctx,
    data: { contact, sendFrom },
  } = props
  const messageIds: string[] = []
  try {
    const policy = resolveInstagramMessagingPolicy({ contact, sendFrom })
    for await (const instagramMessage of convertFlowStepToInstagramMessage(
      props,
    )) {
      const response = await sendInstagramMessage(
        ctx.auth,
        buildMessagePayload(contact, instagramMessage, policy),
      )
      if (response.message_id) {
        messageIds.push(response.message_id)
      }
      logger.info(`Message sent for IGSID: ${contact.sourceId}`)
    }
  } catch (error) {
    logger.error(error, "An error occurred while sending the message")
    throw mapToChannelError(error)
  }

  // Return the Send API message id(s) so the worker can persist messageIds[0]
  // as the Message row's sourceId (coexist echo dedup — see sendMessage).
  return {
    messageIds,
  }
}
