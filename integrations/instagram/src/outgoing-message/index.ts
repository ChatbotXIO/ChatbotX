import {
  type SendAudioStepSchema,
  type SendCarouselStepSchema,
  type SendFileStepSchema,
  type SendImageStepSchema,
  type SendQuickReplyStepSchema,
  type SendTextStepSchema,
  type SendVideoStepSchema,
  StepType,
} from "@aha.chat/flow-config"
import {
  ContentType,
  type OutgoingConversation,
  type OutgoingMessage,
  type SendFlowStepProps,
  type SendMessageProps,
} from "@aha.chat/sdk"
import { sendInstagramMessage } from "../apis/page"
import { logger } from "../lib/logger"
import {
  INSTAGRAM_MESSAGE_METADATA,
  type InstagramAuthValue,
  type InstagramMessageAttachmentPayload,
  type InstagramSendMessage,
  type InstagramSendMessageRequest,
} from "../schemas"
import { getAttachmentTemplate } from "./send-attachment"
import { convertFlowStepCarousel } from "./send-carousel"
import { convertFlowStepFile } from "./send-file"
import { convertFlowStepGif } from "./send-gif"
import { convertFlowStepMedia } from "./send-media"
import { convertFlowStepQuickReply } from "./send-quick-reply"
import { convertFlowStepText } from "./send-text"

export const sendMessage = async (
  props: SendMessageProps<InstagramAuthValue>,
): Promise<void> => {
  const {
    ctx,
    data: { conversation, message },
  } = props

  try {
    for (const instagramMessage of convertMessageToInstagramMessage(message)) {
      const payload = buildMessagePayload(conversation, instagramMessage)
      await sendInstagramMessage(ctx.auth, payload)
      logger.info(`Message sent for IGSID: ${conversation.sourceId}`)
    }
  } catch (error) {
    logger.error(error, "An error occurred while sending the message")
  }
}

export function* convertMessageToInstagramMessage(
  message: OutgoingMessage,
): Generator<InstagramSendMessage> {
  if (message.contentType === ContentType.text) {
    if (message.content) {
      yield {
        text: message.content,
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
      text: message.content ?? "not handled yet",
    }
  }
}

const buildMessagePayload = (
  conversation: OutgoingConversation,
  message: InstagramMessageAttachmentPayload | InstagramSendMessage,
  messagingType: "MESSAGE_TAG" | "RESPONSE" = "RESPONSE",
): InstagramSendMessageRequest => {
  const recipientId = conversation.contact?.sourceId || conversation.sourceId

  if (!recipientId) {
    throw new Error("Missing recipient ID in conversation")
  }

  return {
    recipient: { id: recipientId },
    message: {
      ...message,
      metadata: INSTAGRAM_MESSAGE_METADATA,
    },
    messaging_type: messagingType,
    tag: messagingType === "MESSAGE_TAG" ? "HUMAN_AGENT" : undefined,
  }
}

export async function* convertFlowStepToInstagramMessage(
  props: SendFlowStepProps<InstagramAuthValue>,
): AsyncGenerator<InstagramMessageAttachmentPayload | InstagramSendMessage> {
  const {
    data: { step },
  } = props

  switch (step.stepType) {
    case StepType.sendText:
      yield* convertFlowStepText(
        props as SendFlowStepProps<InstagramAuthValue, SendTextStepSchema>,
      ) as Generator<InstagramMessageAttachmentPayload | InstagramSendMessage>
      break
    case StepType.sendImage:
    case StepType.sendVideo:
      await (yield* convertFlowStepMedia(
        props as SendFlowStepProps<
          InstagramAuthValue,
          SendImageStepSchema | SendVideoStepSchema
        >,
      ))
      break
    case StepType.sendAudio:
    case StepType.sendFile:
      await (yield* convertFlowStepFile(
        props as SendFlowStepProps<
          InstagramAuthValue,
          SendAudioStepSchema | SendFileStepSchema
        >,
      ))
      break
    case StepType.sendGif:
      yield* convertFlowStepGif(step.url) as Generator<InstagramSendMessage>
      break
    case StepType.sendQuickReply:
      yield* convertFlowStepQuickReply(
        props as SendFlowStepProps<
          InstagramAuthValue,
          SendQuickReplyStepSchema
        >,
      ) as Generator<InstagramSendMessage>
      break
    case StepType.sendCarousel:
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
    data: { conversation, step },
  } = props
  try {
    for await (const instagramMessage of convertFlowStepToInstagramMessage(
      props,
    )) {
      await sendInstagramMessage(
        ctx.auth,
        buildMessagePayload(
          conversation,
          instagramMessage,
          step.stepType === StepType.sendQuickReply
            ? "RESPONSE"
            : "MESSAGE_TAG",
        ),
      )
      logger.info(`Message sent for IGSID: ${conversation.sourceId}`)
    }
  } catch (error) {
    logger.error(error, "An error occurred while sending the message")
  }
}
