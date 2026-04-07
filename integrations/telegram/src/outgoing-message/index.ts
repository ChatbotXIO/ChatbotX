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
  type SendFlowStepProps,
  type SendMessageProps,
} from "@aha.chat/sdk"
import {
  sendTelegramAudio,
  sendTelegramDocument,
  sendTelegramMessage,
  sendTelegramPhoto,
  sendTelegramVideo,
} from "../apis/bot"
import { logger } from "../lib/logger"
import type { TelegramAuthValue } from "../schemas"
import {
  convertFlowStepAudio,
  convertFlowStepFile,
  convertFlowStepImage,
  convertFlowStepVideo,
} from "./send-attachment"
import { convertFlowStepCarousel } from "./send-carousel"
import { convertFlowStepQuickReply } from "./send-quick-reply"
import { convertFlowStepText } from "./send-text"

export const sendMessage = async (
  props: SendMessageProps<TelegramAuthValue>,
): Promise<void> => {
  const {
    ctx,
    data: { conversation, message },
  } = props

  const chatId = conversation.contact?.sourceId ?? conversation.sourceId

  if (!chatId) {
    logger.error("Missing chat ID in conversation — message not sent")
    return
  }

  try {
    if (message.contentType === ContentType.text) {
      if (message.content) {
        await sendTelegramMessage(ctx.auth, {
          chat_id: chatId,
          text: message.content,
        })
      }

      for (const attachment of message.attachments ?? []) {
        switch (attachment.fileType) {
          case "image":
            await sendTelegramPhoto(ctx.auth, {
              chat_id: chatId,
              photo: attachment.url as string,
            })
            break
          case "video":
            await sendTelegramVideo(ctx.auth, {
              chat_id: chatId,
              video: attachment.url as string,
            })
            break
          case "audio":
            await sendTelegramAudio(ctx.auth, {
              chat_id: chatId,
              audio: attachment.url as string,
            })
            break
          default:
            await sendTelegramDocument(ctx.auth, {
              chat_id: chatId,
              document: attachment.url as string,
            })
            break
        }
      }
    } else {
      await sendTelegramMessage(ctx.auth, {
        chat_id: chatId,
        text: message.content ?? "not handled yet",
      })
    }
  } catch (error) {
    logger.error(error, "An error occurred while sending the message")
  }
}

export const sendFlowStep = async (
  props: SendFlowStepProps<TelegramAuthValue>,
): Promise<void> => {
  const {
    ctx,
    data: { step },
  } = props

  try {
    switch (step.stepType) {
      case StepType.sendText: {
        for (const payload of convertFlowStepText(
          props as SendFlowStepProps<TelegramAuthValue, SendTextStepSchema>,
        )) {
          await sendTelegramMessage(ctx.auth, payload)
        }
        break
      }
      case StepType.sendImage: {
        for (const payload of convertFlowStepImage(
          props as SendFlowStepProps<TelegramAuthValue, SendImageStepSchema>,
        )) {
          await sendTelegramPhoto(ctx.auth, payload)
        }
        break
      }
      case StepType.sendVideo: {
        for (const payload of convertFlowStepVideo(
          props as SendFlowStepProps<TelegramAuthValue, SendVideoStepSchema>,
        )) {
          await sendTelegramVideo(ctx.auth, payload)
        }
        break
      }
      case StepType.sendAudio: {
        for (const payload of convertFlowStepAudio(
          props as SendFlowStepProps<TelegramAuthValue, SendAudioStepSchema>,
        )) {
          await sendTelegramAudio(ctx.auth, payload)
        }
        break
      }
      case StepType.sendFile: {
        for (const payload of convertFlowStepFile(
          props as SendFlowStepProps<TelegramAuthValue, SendFileStepSchema>,
        )) {
          await sendTelegramDocument(ctx.auth, payload)
        }
        break
      }
      case StepType.sendGif: {
        if ("url" in step) {
          await sendTelegramDocument(ctx.auth, {
            chat_id:
              props.data.conversation.contact?.sourceId ??
              props.data.conversation.sourceId ??
              "",
            document: step.url as string,
          })
        }
        break
      }
      case StepType.sendQuickReply: {
        for (const payload of convertFlowStepQuickReply(
          props as SendFlowStepProps<
            TelegramAuthValue,
            SendQuickReplyStepSchema
          >,
        )) {
          await sendTelegramMessage(ctx.auth, payload)
        }
        break
      }
      case StepType.sendCarousel: {
        for (const payload of convertFlowStepCarousel(
          props as SendFlowStepProps<TelegramAuthValue, SendCarouselStepSchema>,
        )) {
          if ("photo" in payload) {
            await sendTelegramPhoto(ctx.auth, payload)
          } else {
            await sendTelegramMessage(ctx.auth, payload)
          }
        }
        break
      }
      default:
        break
    }
  } catch (error) {
    logger.error(error, "An error occurred while sending flow step")
  }
}
