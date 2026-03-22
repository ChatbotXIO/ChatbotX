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
import { sendPageMessage } from "../apis/page"
import { logger } from "../lib/logger"
import {
  type FacebookMessage,
  type FacebookMessageAttachmentPayload,
  type FacebookSendMessageRequest,
  MESSENGER_MESSAGE_METADATA,
  type MessengerAuthValue,
} from "../schemas"
import { getAttachmentTemplate } from "./send-attachment"
import { convertFlowStepCarousel } from "./send-carousel"
import { convertFlowStepFile } from "./send-file"
import { convertFlowStepGif } from "./send-gif"
import { convertFlowStepMedia } from "./send-media"
import { convertFlowStepQuickReply } from "./send-quick-reply"
import { convertFlowStepText } from "./send-text"

export const sendMessage = async (
  props: SendMessageProps<MessengerAuthValue>,
): Promise<void> => {
  const {
    ctx,
    data: { conversation, message },
  } = props

  try {
    for (const facebookMessage of convertMessageToFacebookMessage(message)) {
      const payload = buildMessagePayload(conversation, facebookMessage)
      await sendPageMessage(ctx.auth, payload)
      logger.info(`Message sent for PSID: ${conversation.sourceId}`)
    }
  } catch (error) {
    logger.error(error, "An error occurred while sending the message")
  }
}

export function* convertMessageToFacebookMessage(
  message: OutgoingMessage,
): Generator<FacebookMessage> {
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
  message: FacebookMessageAttachmentPayload | FacebookMessage,
  messagingType: "MESSAGE_TAG" | "RESPONSE" = "MESSAGE_TAG",
): FacebookSendMessageRequest => {
  const recipientId = conversation.contact?.sourceId || conversation.sourceId

  if (!recipientId) {
    throw new Error("Missing recipient ID in conversation")
  }

  return {
    recipient: { id: recipientId },
    message: {
      ...message,
      metadata: MESSENGER_MESSAGE_METADATA,
    },
    messaging_type: messagingType,
    tag: messagingType === "MESSAGE_TAG" ? "ACCOUNT_UPDATE" : undefined,
  }
}

export async function* convertFlowStepToFacebookMessage(
  props: SendFlowStepProps<MessengerAuthValue>,
): AsyncGenerator<FacebookMessageAttachmentPayload | FacebookMessage> {
  const {
    data: { step },
  } = props

  switch (step.stepType) {
    case StepType.sendText:
      yield* convertFlowStepText(
        props as SendFlowStepProps<MessengerAuthValue, SendTextStepSchema>,
      ) as Generator<FacebookMessageAttachmentPayload | FacebookMessage>
      break
    case StepType.sendImage:
    case StepType.sendVideo:
      await (yield* convertFlowStepMedia(
        props as SendFlowStepProps<
          MessengerAuthValue,
          SendImageStepSchema | SendVideoStepSchema
        >,
      ))
      break
    case StepType.sendAudio:
    case StepType.sendFile:
      await (yield* convertFlowStepFile(
        props as SendFlowStepProps<
          MessengerAuthValue,
          SendAudioStepSchema | SendFileStepSchema
        >,
      ))
      break
    case StepType.sendGif:
      yield* convertFlowStepGif(step.url) as Generator<FacebookMessage>
      break
    case StepType.sendQuickReply:
      yield* convertFlowStepQuickReply(
        props as SendFlowStepProps<
          MessengerAuthValue,
          SendQuickReplyStepSchema
        >,
      ) as Generator<FacebookMessage>
      break
    case StepType.sendCarousel:
      yield* convertFlowStepCarousel(
        props as SendFlowStepProps<MessengerAuthValue, SendCarouselStepSchema>,
      ) as Generator<FacebookMessage>
      break
    default:
      break
  }
}

export const sendFlowStep = async (
  props: SendFlowStepProps<MessengerAuthValue>,
) => {
  const {
    ctx,
    data: { conversation, step },
  } = props
  try {
    for await (const facebookMessage of convertFlowStepToFacebookMessage(
      props,
    )) {
      await sendPageMessage(
        ctx.auth,
        buildMessagePayload(
          conversation,
          facebookMessage,
          step.stepType === StepType.sendQuickReply
            ? "RESPONSE"
            : "MESSAGE_TAG",
        ),
      )
      logger.info(`Message sent for PSID: ${conversation.sourceId}`)
    }
  } catch (error) {
    logger.error(error, "An error occurred while sending the message")
  }
}
