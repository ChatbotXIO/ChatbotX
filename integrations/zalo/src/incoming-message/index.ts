import {
  type AttachmentEntity,
  ContentType,
  type Context,
  type ConversationEntity,
  type MessageEntity,
  MessageType,
  type ReceivedMessageResult,
} from "@aha.chat/sdk"
import { getMessageAttachmentEntity } from "../api/message"
import { ZaloException } from "../libs/exception"
import { logger } from "../libs/logger"
import type { ZaloAuthValue } from "../schemas/definition"
import type { ZaloWebhookEvent } from "../schemas/webhook"

const getMessageAttachments = async (
  ctx: Context<ZaloAuthValue>,
  message: ZaloWebhookEvent["message"],
): Promise<AttachmentEntity[]> => {
  if (!message?.attachments) {
    return []
  }

  try {
    const attachmentPromises = message.attachments
      .filter((attachment) => attachment.payload.url)
      .map((attachment) =>
        getMessageAttachmentEntity({
          ctx,
          attachment,
        }),
      )

    const results = await Promise.allSettled(attachmentPromises)

    return results
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<AttachmentEntity | undefined> =>
          result.status === "fulfilled" && result.value !== undefined,
      )
      .map((result) => result.value as AttachmentEntity)
  } catch (error) {
    logger.error(error, "Error getting message attachments")
    return []
  }
}

export const parseIncomingMessage = async ({
  ctx,
  data,
}: {
  ctx: Context<ZaloAuthValue>
  data: ZaloWebhookEvent
}): Promise<ReceivedMessageResult | null> => {
  if (!data.message) {
    return null
  }

  const { message, postbackAction } = await getMessageEntity(ctx, data)

  // Calculate conversation
  const sourceId = data.event_name.includes("user_send")
    ? data.sender.id
    : data.recipient.id
  const conversation: ConversationEntity = {
    sourceId,
    conversationAttributes: {},
    contact: {
      sourceId,
    },
  }

  return {
    message,
    conversation,
    postbackAction,
    quickReplyAction: null,
    ref: null,
  }
}

const getMessageEntity = async (
  ctx: Context<ZaloAuthValue>,
  event: ZaloWebhookEvent,
): Promise<{ message: MessageEntity; postbackAction: string | null }> => {
  if (!event.message.msg_id) {
    throw new ZaloException("Missing msg_id in message event")
  }
  let message: MessageEntity = {
    sourceId: event.message.msg_id,
    messageType: event.event_name.includes("user_send")
      ? MessageType.incoming
      : MessageType.outgoing,
    content: event.message?.text,
    contentType: ContentType.text,
    attachments: [],
  }

  switch (event.event_name) {
    case "user_send_text":
    case "oa_send_text":
    case "user_send_image":
    case "oa_send_image":
    case "user_send_sticker":
    case "oa_send_sticker":
    case "user_send_file":
    case "oa_send_file":
    case "user_send_audio":
      message.attachments = await getMessageAttachments(ctx, event.message)
      break
    case "user_send_location": {
      const attachment = event.message?.attachments?.[0]
      message = {
        ...message,
        content: attachment?.payload?.coordinates
          ? `https://www.google.com/maps/search/?api=1&query=${attachment.payload.coordinates.latitude},${attachment.payload.coordinates.longitude}`
          : "Location",
        contentType: ContentType.location,
        attachments: await getMessageAttachments(ctx, event.message),
        contentAttributes: {
          latitude: attachment?.payload.coordinates?.latitude,
          longitude: attachment?.payload.coordinates?.longitude,
        },
      }
      break
    }
    default:
      break
  }

  if (!message.content) {
    throw new ZaloException(`No content found in message ${event.event_name}`)
  }

  // Detect postback action
  let postbackAction: string | null = null
  if (message.content.startsWith("postback_")) {
    postbackAction = message.content.replace("postback_", "")
  }

  return { message, postbackAction }
}
