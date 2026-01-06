import {
  type AttachmentEntity,
  ContentType,
  type Context,
  type ConversationEntity,
  type MessageEntity,
  MessageType,
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
    logger.error("Error getting message attachments", error)
    return []
  }
}

export const parseIncomingMessage = async ({
  ctx,
  data,
}: {
  ctx: Context<ZaloAuthValue>
  data: ZaloWebhookEvent
}) => {
  if (!data.message) {
    return null
  }

  const message: MessageEntity = await getMessageEntity(ctx, data)

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

  const postbackAction: { flowVersionId: string; buttonId: string } | null =
    getPostbackAction(message)

  return Promise.resolve({
    message,
    conversation,
    postbackAction,
  })
}

const getMessageEntity = async (
  ctx: Context<ZaloAuthValue>,
  event: ZaloWebhookEvent,
): Promise<MessageEntity> => {
  if (!event.message.msg_id) {
    throw new ZaloException("Missing msg_id in message event")
  }
  const baseMessage = {
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
      return {
        ...baseMessage,
        attachments: await getMessageAttachments(ctx, event.message),
      }
    case "user_send_location": {
      const attachment = event.message?.attachments?.[0]
      return {
        ...baseMessage,
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
    }
    default:
      break
  }

  throw new ZaloException(`No message found ${event.event_name}`)
}

const getPostbackAction = (
  message: MessageEntity,
): { flowVersionId: string; buttonId: string } | null => {
  if (message.content?.startsWith("postback_")) {
    const postbackPayload: string[] = message.content.split("_")
    if (postbackPayload.length === 3) {
      return {
        flowVersionId: postbackPayload[1],
        buttonId: postbackPayload[2],
      }
    }
  }
  return null
}
