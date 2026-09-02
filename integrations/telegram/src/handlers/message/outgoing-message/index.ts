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
  type SendFlowStepProps,
} from "@chatbotx.io/sdk"
import {
  sendTelegramAudio,
  sendTelegramDocument,
  sendTelegramMediaGroup,
  sendTelegramMessage,
  sendTelegramPhoto,
  sendTelegramVideo,
} from "../../../apis/bot"
import { MAX_INLINE_BUTTONS_PER_ROW } from "../../../constants"
import { mapToChannelError } from "../../../lib/error-mapper"
import { logger } from "../../../lib/logger"
import type { TelegramAuthValue } from "../../../schema"
import {
  convertFlowStepAudio,
  convertFlowStepFile,
  convertFlowStepImage,
  convertFlowStepMultipleImages,
  convertFlowStepVideo,
} from "./send-attachment"
import {
  buildCanonicalInlineButton,
  buildInlineKeyboardFromButtons,
} from "./send-button"
import { convertFlowStepCarousel } from "./send-carousel"
import { convertFlowStepQuickReply } from "./send-quick-reply"
import { convertFlowStepText } from "./send-text"

export const sendMessage: MessageHandlers<TelegramAuthValue>["sendMessage"] =
  async (props) => {
    const {
      ctx,
      data: { contact, message, quickReplies },
    } = props

    const messageIds: string[] = []

    try {
      if (message.contentType === contentTypes.enum.text) {
        if (message.text) {
          const messageId = await sendTelegramMessage(ctx.auth, {
            chat_id: contact.sourceId,
            text: message.text,
            reply_markup:
              quickReplies && quickReplies.length > 0
                ? buildInlineKeyboardFromButtons(
                    quickReplies.map(buildCanonicalInlineButton),
                    MAX_INLINE_BUTTONS_PER_ROW,
                  )
                : undefined,
          })
          messageIds.push(String(messageId))
        }

        // Multiple images in one outgoing message batch into a single
        // sendMediaGroup call (same mechanism the sendMultipleImages flow
        // step uses), instead of one sendPhoto call per image; every other
        // attachment type still sends as its own message.
        const attachments = message.attachments ?? []
        const imageAttachments = attachments.filter(
          (attachment) => attachment.fileType === "image",
        )
        const otherAttachments = attachments.filter(
          (attachment) => attachment.fileType !== "image",
        )

        if (imageAttachments.length > 1) {
          const ids = await sendTelegramMediaGroup(ctx.auth, {
            chat_id: contact.sourceId,
            media: imageAttachments.map((attachment) => ({
              type: "photo" as const,
              media: attachment.url as string,
            })),
          })
          messageIds.push(...ids.map(String))
        } else if (imageAttachments.length === 1) {
          const messageId = await sendTelegramPhoto(ctx.auth, {
            chat_id: contact.sourceId,
            photo: imageAttachments[0].url as string,
          })
          messageIds.push(String(messageId))
        }

        for (const attachment of otherAttachments) {
          switch (attachment.fileType) {
            case "video": {
              const messageId = await sendTelegramVideo(ctx.auth, {
                chat_id: contact.sourceId,
                video: attachment.url as string,
              })
              messageIds.push(String(messageId))
              break
            }
            case "audio": {
              const messageId = await sendTelegramAudio(ctx.auth, {
                chat_id: contact.sourceId,
                audio: attachment.url as string,
              })
              messageIds.push(String(messageId))
              break
            }
            default: {
              const messageId = await sendTelegramDocument(ctx.auth, {
                chat_id: contact.sourceId,
                document: attachment.url as string,
              })
              messageIds.push(String(messageId))
              break
            }
          }
        }
      } else {
        const messageId = await sendTelegramMessage(ctx.auth, {
          chat_id: contact.sourceId,
          text: message.text ?? "not handled yet",
        })
        messageIds.push(String(messageId))
      }
    } catch (error) {
      logger.error(error, "An error occurred while sending the message")
      throw mapToChannelError(error)
    }

    return {
      messageIds,
    }
  }

export const sendFlowStep: MessageHandlers<TelegramAuthValue>["sendFlowStep"] =
  async (props) => {
    const {
      ctx,
      data: { step },
    } = props

    const messageIds: string[] = []

    try {
      switch (step.stepType) {
        case stepTypes.enum.sendText: {
          for (const payload of convertFlowStepText(
            props as Parameters<
              MessageHandlers<
                TelegramAuthValue,
                SendTextStepSchema
              >["sendFlowStep"]
            >[0],
          )) {
            const messageId = await sendTelegramMessage(ctx.auth, payload)
            messageIds.push(String(messageId))
          }
          break
        }
        case stepTypes.enum.sendImage: {
          for (const payload of convertFlowStepImage(
            props as Parameters<
              MessageHandlers<
                TelegramAuthValue,
                SendImageStepSchema
              >["sendFlowStep"]
            >[0],
          )) {
            const messageId = await sendTelegramPhoto(ctx.auth, payload)
            messageIds.push(String(messageId))
          }
          break
        }
        case stepTypes.enum.sendMultipleImages: {
          for (const payload of convertFlowStepMultipleImages(
            props as Parameters<
              MessageHandlers<
                TelegramAuthValue,
                SendMultipleImagesStepSchema
              >["sendFlowStep"]
            >[0],
          )) {
            const ids = await sendTelegramMediaGroup(ctx.auth, payload)
            messageIds.push(...ids.map(String))
          }
          break
        }
        case stepTypes.enum.sendVideo: {
          for (const payload of convertFlowStepVideo(
            props as Parameters<
              MessageHandlers<
                TelegramAuthValue,
                SendVideoStepSchema
              >["sendFlowStep"]
            >[0],
          )) {
            const messageId = await sendTelegramVideo(ctx.auth, payload)
            messageIds.push(String(messageId))
          }
          break
        }
        case stepTypes.enum.sendAudio: {
          for (const payload of convertFlowStepAudio(
            props as Parameters<
              MessageHandlers<
                TelegramAuthValue,
                SendAudioStepSchema
              >["sendFlowStep"]
            >[0],
          )) {
            const messageId = await sendTelegramAudio(ctx.auth, payload)
            messageIds.push(String(messageId))
          }
          break
        }
        case stepTypes.enum.sendFile: {
          for (const payload of convertFlowStepFile(
            props as Parameters<
              MessageHandlers<
                TelegramAuthValue,
                SendFileStepSchema
              >["sendFlowStep"]
            >[0],
          )) {
            const messageId = await sendTelegramDocument(ctx.auth, payload)
            messageIds.push(String(messageId))
          }
          break
        }
        case stepTypes.enum.sendGif: {
          if ("url" in step) {
            const messageId = await sendTelegramDocument(ctx.auth, {
              chat_id: props.data.contact.sourceId,
              document: step.url as string,
              reply_markup:
                props.data.quickReplies && props.data.quickReplies.length > 0
                  ? buildInlineKeyboardFromButtons(
                      props.data.quickReplies.map(buildCanonicalInlineButton),
                      MAX_INLINE_BUTTONS_PER_ROW,
                    )
                  : undefined,
            })
            messageIds.push(String(messageId))
          }
          break
        }
        case stepTypes.enum.sendQuickReply: {
          for (const payload of convertFlowStepQuickReply(
            props as Parameters<
              MessageHandlers<
                TelegramAuthValue,
                SendQuickReplyStepSchema
              >["sendFlowStep"]
            >[0],
          )) {
            const messageId = await sendTelegramMessage(ctx.auth, payload)
            messageIds.push(String(messageId))
          }
          break
        }
        case stepTypes.enum.sendCarousel: {
          for (const payload of convertFlowStepCarousel(
            props as SendFlowStepProps<
              TelegramAuthValue,
              SendCarouselStepSchema
            >,
          )) {
            if ("photo" in payload) {
              const messageId = await sendTelegramPhoto(ctx.auth, payload)
              messageIds.push(String(messageId))
            } else {
              const messageId = await sendTelegramMessage(ctx.auth, payload)
              messageIds.push(String(messageId))
            }
          }
          break
        }
        default:
          break
      }
    } catch (error) {
      logger.error(error, "An error occurred while sending flow step")
      throw mapToChannelError(error)
    }

    return {
      messageIds,
    }
  }
