import {
  type SendAudioStepSchema,
  type SendCarouselStepSchema,
  type SendFileStepSchema,
  type SendImageStepSchema,
  type SendMultipleImagesStepSchema,
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
import { sendPrivateReplyMessage } from "../../../apis/comment"
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
import { convertFlowStepMultipleImages } from "./send-multiple-images"
import { convertCanonicalInstagramQuickReplies } from "./send-quick-replies"
import { convertFlowStepQuickReply } from "./send-quick-reply"
import { convertFlowStepText } from "./send-text"

export const sendMessage: MessageHandlers<InstagramAuthValue>["sendMessage"] =
  async (props) => {
    const {
      ctx,
      data: { contact, message, quickReplies },
    } = props

    const messageIds: string[] = []
    try {
      const instagramMessages = [...convertMessageToInstagramMessage(message)]
      const lastMessage = instagramMessages.at(-1)
      if (lastMessage && quickReplies && quickReplies.length > 0) {
        lastMessage.quick_replies =
          convertCanonicalInstagramQuickReplies(quickReplies)
      }
      for (const instagramMessage of instagramMessages) {
        const payload = buildMessagePayload(contact, instagramMessage)
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
    // Multiple images in one outgoing message batch into a single Send API
    // call via `attachments[]` (same mechanism the sendMultipleImages flow
    // step uses), instead of one message per image; every other attachment
    // type still sends as its own message.
    const attachments = message.attachments || []
    const imageAttachments = attachments.filter(
      (attachment) => attachment.fileType === "image",
    )
    const otherAttachments = attachments.filter(
      (attachment) => attachment.fileType !== "image",
    )

    if (imageAttachments.length > 1) {
      yield {
        attachments: imageAttachments.map((attachment) =>
          getAttachmentTemplate(attachment.url as string, "image"),
        ),
      }
    } else if (imageAttachments.length === 1) {
      yield {
        attachment: getAttachmentTemplate(
          imageAttachments[0].url as string,
          "image",
        ),
      }
    }

    for (const attachment of otherAttachments) {
      switch (attachment.fileType) {
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
    logger.warn(
      { contentType: message.contentType },
      "Unsupported content type — skipping outgoing message",
    )
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
    case stepTypes.enum.sendMultipleImages:
      yield* convertFlowStepMultipleImages(
        props as SendFlowStepProps<
          InstagramAuthValue,
          SendMultipleImagesStepSchema
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
    data: { contact, commentAnchor },
  } = props
  const messageIds: string[] = []
  try {
    // Consumed by the first Instagram message yielded below, if a private
    // comment anchor is present — a single flow step can yield more than one
    // message (e.g. text + attachments), so only the very first send uses the
    // comment_id-anchored API (exempt from the messaging window); the rest
    // use the normal path. A "public" anchor is never honored here — it's
    // delivered via the comment channel's sendComment, not this message
    // channel's sendFlowStep (see send-flow-step.ts). This check is
    // defense-in-depth against a public anchor ever reaching this handler by
    // mistake.
    let anchorCommentId =
      commentAnchor?.replyChannel === "private"
        ? commentAnchor.commentId
        : undefined
    for await (const instagramMessage of convertFlowStepToInstagramMessage(
      props,
    )) {
      const response = anchorCommentId
        ? await sendPrivateReplyMessage(
            ctx.auth,
            anchorCommentId,
            instagramMessage,
          )
        : await sendInstagramMessage(
            ctx.auth,
            buildMessagePayload(contact, instagramMessage),
          )
      anchorCommentId = undefined
      if (response.message_id) {
        messageIds.push(response.message_id)
      }
      logger.info(`Message sent for IGSID: ${contact.sourceId}`)
    }
  } catch (error) {
    logger.error(error, "An error occurred while sending the message")
    throw mapToChannelError(error)
  }

  return {
    messageIds,
  }
}
