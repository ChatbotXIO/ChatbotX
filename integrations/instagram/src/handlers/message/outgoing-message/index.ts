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
  contentTypes,
  type MessageHandlers,
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

export const sendMessage: MessageHandlers<InstagramAuthValue>["sendMessage"] =
  async (props) => {
    const {
      ctx,
      data: { contact, message },
    } = props

    try {
      for (const instagramMessage of convertMessageToInstagramMessage(
        message,
      )) {
        const payload = buildMessagePayload(contact, instagramMessage)
        await sendInstagramMessage(ctx.auth, payload)
        logger.info(`Message sent for IGSID: ${contact.sourceId}`)
      }
    } catch (error) {
      logger.error(error, "An error occurred while sending the message")
      throw mapToChannelError(error)
    }

    return {
      messageIds: [],
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
      await (yield* convertFlowStepMedia(
        props as SendFlowStepProps<
          InstagramAuthValue,
          SendImageStepSchema | SendVideoStepSchema
        >,
      ))
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
      yield* convertFlowStepGif(step.url) as Generator<InstagramSendMessage>
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
    data: { contact },
  } = props
  try {
    for await (const instagramMessage of convertFlowStepToInstagramMessage(
      props,
    )) {
      await sendInstagramMessage(
        ctx.auth,
        buildMessagePayload(contact, instagramMessage),
      )
      logger.info(`Message sent for IGSID: ${contact.sourceId}`)
    }
  } catch (error) {
    logger.error(error, "An error occurred while sending the message")
    throw mapToChannelError(error)
  }

  return {
    messageIds: [],
  }
}
