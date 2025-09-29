import { MessageType } from "@aha.chat/database/types"
import {
  type AttachmentEntity,
  ContentType,
  type Context,
  type ConversationEntity,
  SdkException,
} from "@aha.chat/sdk"

import { getMessageAttachmentEntity } from "./apis/page"
import { logger } from "./lib/logger"
import type {
  MessengerAuthValue,
  MessengerMessage,
  MessengerMessagingEvent,
  MessengerWebhookEvent,
} from "./schemas"

const getMessageAttachments = async (
  ctx: Context<MessengerAuthValue>,
  message: MessengerMessage,
): Promise<AttachmentEntity[]> => {
  if (!message.attachments) {
    return []
  }

  try {
    const attachments: AttachmentEntity[] = []
    for (const attachment of message.attachments) {
      if (attachment.payload.url) {
        const messageAttachment = await getMessageAttachmentEntity({
          ctx,
          attachment,
        })
        if (messageAttachment) {
          attachments.push(messageAttachment)
        }
      }
    }
    return attachments
  } catch (_error) {
    logger.error("Error getting message attachments", _error)
    return []
  }
}

export const parseIncomingMessage = async ({
  ctx,
  data,
}: {
  ctx: Context<MessengerAuthValue>
  data: MessengerWebhookEvent
}) => {
  const entry = data.entry[0]

  if (!entry.messaging[0]) {
    throw new SdkException("No messaging found")
  }

  const messaging = entry.messaging[0]
  if (!(messaging.message || messaging.postback)) {
    throw new SdkException("No message found")
  }

  const sourceId = entry.id
  const message = await getMessageEntity(ctx, messaging)
  if (!message) {
    throw new SdkException("Cannot parse message")
  }
  const postbackAction: { flowVersionId: string; buttonId: string } | null =
    getPostbackAction(messaging)

  const conversation: ConversationEntity = {
    sourceId,
    conversationAttributes: {},
    contact: {
      sourceId: messaging.message?.is_echo
        ? messaging.recipient.id
        : messaging.sender.id,
    },
  }

  return Promise.resolve({ message, conversation, postbackAction })
}

const getMessageEntity = async (
  ctx: Context<MessengerAuthValue>,
  messaging: MessengerMessagingEvent,
) => {
  if (messaging.message) {
    return {
      sourceId: messaging.message.mid,
      messageType: messaging.message.is_echo
        ? MessageType.OUTGOING
        : MessageType.INCOMING,
      content: messaging.message.text,
      contentType: ContentType.TEXT,
      attachments: await getMessageAttachments(ctx, messaging.message),
    }
  }
  if (messaging.postback) {
    return {
      sourceId: messaging.postback.mid,
      messageType: MessageType.INCOMING,
      content: messaging.postback.title,
      contentType: ContentType.TEXT,
      attachments: [],
    }
  }
}

const getPostbackAction = (
  messaging: MessengerMessagingEvent,
): { flowVersionId: string; buttonId: string } | null => {
  if (messaging.postback) {
    const postbackPayload: string[] = messaging.postback.payload.split("_")
    if (postbackPayload.length === 2) {
      return {
        flowVersionId: postbackPayload[0],
        buttonId: postbackPayload[1],
      }
    }
  }
  return null
}
