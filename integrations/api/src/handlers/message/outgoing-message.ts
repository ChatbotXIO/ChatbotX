import { stepTypes } from "@chatbotx.io/flow-config"
import {
  contentTypes,
  type MessageHandlers,
  type ReceivedMessageResult,
  type SendFlowStepData,
} from "@chatbotx.io/sdk"
import { z } from "zod"
import { postSignedEnvelope } from "../../lib/delivery"
import { logger } from "../../lib/logger"
import type { ApiAuthValue } from "../../schema"

const messageStatusPayloadSchema = z.object({
  messageSourceId: z.string().min(1),
  status: z.string(),
})

export const sendMessage: MessageHandlers<ApiAuthValue>["sendMessage"] = async (
  props,
) => {
  const {
    ctx,
    data: { contact, message, quickReplies },
  } = props

  if (!ctx.auth.callbackUrl) {
    // Inbound-only channels (no callback URL configured) are valid, not an error.
    return { messageIds: [] }
  }

  const response = await postSignedEnvelope({
    callbackUrl: ctx.auth.callbackUrl,
    signingSecret: ctx.auth.signingSecret,
    envelope: {
      event: "message_created",
      timestamp: new Date().toISOString(),
      contact: { id: contact.id, sourceId: contact.sourceId },
      conversation: { id: message.conversationId },
      message: {
        id: message.id,
        text: message.text,
        messageType: message.messageType,
        contentType: message.contentType,
        attachments: message.attachments,
        contentAttributes: message.contentAttributes,
        quickReplies,
      },
    },
  })

  return { messageIds: response?.messageId ? [response.messageId] : [] }
}

/**
 * Full rich parity is the point of this channel — unlike webchat, which
 * no-ops `sendFlowStep` entirely, every flow step variant is mapped onto the
 * same envelope shape as `sendMessage`, with `contentAttributes` carrying the
 * rich payload. Unsupported step types degrade to their text content.
 */
export const sendFlowStep: MessageHandlers<ApiAuthValue>["sendFlowStep"] =
  async (props) => {
    const {
      ctx,
      data: { contact, step, quickReplies },
    } = props

    if (!ctx.auth.callbackUrl) {
      return { messageIds: [] }
    }

    const { text, contentAttributes } = mapFlowStepToEnvelope(step)

    const response = await postSignedEnvelope({
      callbackUrl: ctx.auth.callbackUrl,
      signingSecret: ctx.auth.signingSecret,
      envelope: {
        event: "message_created",
        timestamp: new Date().toISOString(),
        contact: { id: contact.id, sourceId: contact.sourceId },
        message: {
          text,
          messageType: "outgoing",
          contentType: contentTypes.enum.text,
          contentAttributes,
          quickReplies,
        },
      },
    })

    return { messageIds: response?.messageId ? [response.messageId] : [] }
  }

const fileTypeForStep = (
  stepType: SendFlowStepData["stepType"],
): "image" | "audio" | "video" | "file" => {
  switch (stepType) {
    case stepTypes.enum.sendImage:
    case stepTypes.enum.sendGif:
      return "image"
    case stepTypes.enum.sendAudio:
      return "audio"
    case stepTypes.enum.sendVideo:
      return "video"
    default:
      return "file"
  }
}

const mapFlowStepToEnvelope = (
  step: SendFlowStepData,
): { text: string | null; contentAttributes?: Record<string, unknown> } => {
  switch (step.stepType) {
    case stepTypes.enum.sendText:
      return { text: step.text }
    case stepTypes.enum.sendImage:
    case stepTypes.enum.sendGif:
    case stepTypes.enum.sendVideo:
    case stepTypes.enum.sendAudio:
    case stepTypes.enum.sendFile:
      return {
        text: null,
        contentAttributes: {
          attachments: [
            { url: step.url, fileType: fileTypeForStep(step.stepType) },
          ],
        },
      }
    case stepTypes.enum.sendMultipleImages:
      return {
        text: null,
        contentAttributes: {
          attachments: step.images.map((image) => ({
            url: image.url,
            fileType: "image" as const,
          })),
        },
      }
    case stepTypes.enum.sendQuickReply:
      return { text: step.message }
    case stepTypes.enum.sendCarousel:
      return {
        text: null,
        contentAttributes: {
          type: "template",
          payload: {
            templateType: "carousel",
            cards: step.cards.map((card) => ({
              id: card.id,
              title: card.title,
              subtitle: card.subtitle,
              imageUrl: card.image?.url,
              buttons: card.buttons,
            })),
          },
        },
      }
    default:
      logger.warn(
        { stepType: step.stepType },
        "API channel: unsupported flow step type, degrading to text",
      )
      return {
        text:
          "text" in step && typeof step.text === "string" ? step.text : null,
      }
  }
}

export const handleMessageStatus: NonNullable<
  MessageHandlers<ApiAuthValue>["handleMessageStatus"]
> = ({ data }): Promise<ReceivedMessageResult | null> => {
  const validated = messageStatusPayloadSchema.parse(data.payload)

  return Promise.resolve({
    message: {
      sourceId: validated.messageSourceId,
      messageType: "outgoing",
      contentType: contentTypes.enum.text,
      contentAttributes: { deliveryStatus: validated.status },
    },
    contact: { sourceId: "" },
    postbackAction: null,
    quickReplyAction: null,
    ref: null,
  })
}
