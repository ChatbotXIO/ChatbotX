import {
  type Context,
  contentTypes,
  type IncomingAttachment,
  type IncomingContact,
  type IncomingMessage,
  type MessageHandlers,
  messageTypes,
} from "@chatbotx.io/sdk"
import { getMessageAttachmentEntity } from "../../../api/message"
import { ZaloException } from "../../../lib/exception"
import { logger } from "../../../lib/logger"
import type { ZaloAuthValue, ZaloWebhookEvent } from "../../../schema"

const getMessageAttachments = async (
  ctx: Context<ZaloAuthValue>,
  message: ZaloWebhookEvent["message"],
): Promise<IncomingAttachment[]> => {
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
        ): result is PromiseFulfilledResult<IncomingAttachment | undefined> =>
          result.status === "fulfilled" && result.value !== undefined,
      )
      .map((result) => result.value as IncomingAttachment)
  } catch (error) {
    logger.error(error, "Error getting message attachments")
    return []
  }
}

export const receiveMessage: MessageHandlers<ZaloAuthValue>["receiveMessage"] =
  async (props) => {
    const {
      ctx,
      data: { payload },
    } = props

    const data = payload as ZaloWebhookEvent

    if (!data.message) {
      return null
    }

    const { message, postbackAction } = await getMessageEntity(ctx, data)

    // Calculate conversation
    const sourceId = data.event_name.includes("user_send")
      ? data.sender.id
      : data.recipient.id

    const contact: IncomingContact = {
      sourceId,
    }

    return {
      message,
      contact,
      postbackAction,
      quickReplyAction: null,
      ref: null,
    }
  }

const getMessageEntity = async (
  ctx: Context<ZaloAuthValue>,
  event: ZaloWebhookEvent,
): Promise<{ message: IncomingMessage; postbackAction: string | null }> => {
  if (!event.message.msg_id) {
    throw new ZaloException("Missing msg_id in message event")
  }
  let message: IncomingMessage = {
    sourceId: event.message.msg_id,
    messageType: event.event_name.includes("user_send")
      ? messageTypes.enum.incoming
      : messageTypes.enum.outgoing,
    text: event.message?.text,
    contentType: contentTypes.enum.text,
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
        text: attachment?.payload?.coordinates
          ? `https://www.google.com/maps/search/?api=1&query=${attachment.payload.coordinates.latitude},${attachment.payload.coordinates.longitude}`
          : "Location",
        contentType: contentTypes.enum.location,
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

  if (!message.text) {
    throw new ZaloException(`No content found in message ${event.event_name}`)
  }

  // Detect postback action
  let postbackAction: string | null = null
  if (message.text.startsWith("postback_")) {
    postbackAction = message.text.replace("postback_", "")
  }

  return { message, postbackAction }
}
