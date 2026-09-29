import {
  type SendImageStepSchema,
  type SendMultipleImagesStepSchema,
  type SendTextStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import { sendMessage as sendMessageApi } from "../../../apis/message"
import { mapToChannelError } from "../../../lib/error-mapper"
import { requireConversationId } from "../../../lib/guards"
import { logger } from "../../../lib/logger"
import type { TiktokAuthValue } from "../../../schema"
import { uploadAndBuildImagePayload } from "./send-media"
import { convertFlowStepText } from "./send-text"

export const sendMessage: MessageHandlers<TiktokAuthValue>["sendMessage"] =
  async (props) => {
    const {
      ctx,
      data: { contact, message },
    } = props

    const businessId = ctx.auth.metadata.openId
    const messageIds: string[] = []
    let sentCount = 0

    try {
      const conversationId = requireConversationId(contact.sourceConversationId)

      if (message.text) {
        const messageId = await sendMessageApi(ctx.auth.tokens.accessToken, {
          business_id: businessId,
          recipient_type: "CONVERSATION",
          recipient: conversationId,
          message_type: "TEXT",
          text: { body: message.text },
        })
        sentCount += 1
        if (messageId) {
          messageIds.push(messageId)
        }
      }

      for (const attachment of message.attachments ?? []) {
        if (attachment.fileType === "image") {
          if (!attachment.url) {
            continue
          }
          const payload = await uploadAndBuildImagePayload(
            ctx.auth.tokens.accessToken,
            businessId,
            conversationId,
            attachment.url,
          )
          const messageId = await sendMessageApi(
            ctx.auth.tokens.accessToken,
            payload,
          )
          sentCount += 1
          if (messageId) {
            messageIds.push(messageId)
          }
        }
      }
    } catch (error) {
      logger.error(error, "An error occurred while sending TikTok message")
      throw mapToChannelError(error)
    }

    return { messageIds, sentCount }
  }

export const sendFlowStep: MessageHandlers<TiktokAuthValue>["sendFlowStep"] =
  async (props) => {
    const {
      ctx,
      data: { contact, step },
    } = props

    const businessId = ctx.auth.metadata.openId
    const messageIds: string[] = []
    let sentCount = 0

    try {
      const conversationId = requireConversationId(contact.sourceConversationId)

      switch (step.stepType) {
        case stepTypes.enum.sendText: {
          for (const payload of convertFlowStepText(
            businessId,
            props as Parameters<
              MessageHandlers<
                TiktokAuthValue,
                SendTextStepSchema
              >["sendFlowStep"]
            >[0],
          )) {
            const messageId = await sendMessageApi(
              ctx.auth.tokens.accessToken,
              payload,
            )
            sentCount += 1
            if (messageId) {
              messageIds.push(messageId)
            }
          }
          break
        }
        case stepTypes.enum.sendImage: {
          const payload = await uploadAndBuildImagePayload(
            ctx.auth.tokens.accessToken,
            businessId,
            conversationId,
            (step as SendImageStepSchema).url,
          )
          const messageId = await sendMessageApi(
            ctx.auth.tokens.accessToken,
            payload,
          )
          sentCount += 1
          if (messageId) {
            messageIds.push(messageId)
          }
          break
        }
        case stepTypes.enum.sendMultipleImages: {
          for (const image of (step as SendMultipleImagesStepSchema).images) {
            const payload = await uploadAndBuildImagePayload(
              ctx.auth.tokens.accessToken,
              businessId,
              conversationId,
              image.url,
            )
            const messageId = await sendMessageApi(
              ctx.auth.tokens.accessToken,
              payload,
            )
            sentCount += 1
            if (messageId) {
              messageIds.push(messageId)
            }
          }
          break
        }
        default:
          break
      }
    } catch (error) {
      logger.error(error, "An error occurred while sending TikTok flow step")
      throw mapToChannelError(error)
    }

    return { messageIds, sentCount }
  }
