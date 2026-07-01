import {
  type SendImageStepSchema,
  type SendTextStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import {
  ChannelError,
  ChannelErrorCategory,
  type MessageHandlers,
} from "@chatbotx.io/sdk"
import { sendTiktokMessage } from "../../../apis/message"
import { mapToChannelError } from "../../../lib/error-mapper"
import { logger } from "../../../lib/logger"
import type { TiktokAuthValue } from "../../../schema"
import { uploadAndBuildImagePayload } from "./send-media"
import { convertFlowStepText } from "./send-text"

function requireConversationId(
  sourceConversationId: string | null | undefined,
): string {
  if (!sourceConversationId) {
    throw new ChannelError(
      "TikTok requires a conversation_id to send messages (recipient_type: CONVERSATION). This contact has no sourceConversationId — wait for an inbound message or backfill the column.",
      ChannelErrorCategory.INVALID_RECIPIENT,
      { code: "tiktok_missing_conversation_id" },
    )
  }
  return sourceConversationId
}

export const sendMessage: MessageHandlers<TiktokAuthValue>["sendMessage"] =
  async (props) => {
    const {
      ctx,
      data: { contact, message },
    } = props

    const businessId = ctx.auth.metadata.openId
    const messageIds: string[] = []

    try {
      const conversationId = requireConversationId(contact.sourceConversationId)

      if (message.text) {
        const messageId = await sendTiktokMessage(ctx.auth.tokens.accessToken, {
          business_id: businessId,
          recipient_type: "CONVERSATION",
          recipient: conversationId,
          message_type: "TEXT",
          text: { body: message.text },
        })
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
          const messageId = await sendTiktokMessage(
            ctx.auth.tokens.accessToken,
            payload,
          )
          if (messageId) {
            messageIds.push(messageId)
          }
        }
      }
    } catch (error) {
      logger.error(error, "An error occurred while sending TikTok message")
      throw mapToChannelError(error)
    }

    return { messageIds }
  }

export const sendFlowStep: MessageHandlers<TiktokAuthValue>["sendFlowStep"] =
  async (props) => {
    const {
      ctx,
      data: { contact, step },
    } = props

    const businessId = ctx.auth.metadata.openId
    const messageIds: string[] = []

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
            const messageId = await sendTiktokMessage(
              ctx.auth.tokens.accessToken,
              payload,
            )
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
          const messageId = await sendTiktokMessage(
            ctx.auth.tokens.accessToken,
            payload,
          )
          if (messageId) {
            messageIds.push(messageId)
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

    return { messageIds }
  }
