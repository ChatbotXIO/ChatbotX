import {
  type AttachmentEntity,
  ContentType,
  type Context,
  type ConversationEntity,
  type MessageEntity,
  MessageType,
  type ReceivedMessageResult,
} from "@aha.chat/sdk"

import { getMessageAttachmentEntity } from "./apis/page"
import { MessengerException } from "./exception"
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
    const attachmentPromises = message.attachments
      .filter((attachment) => attachment.payload.url)
      .map((attachment) =>
        getMessageAttachmentEntity({ ctx, attachment }).catch((error) => {
          logger.error("Error processing attachment", error)
          return null
        }),
      )

    const attachmentResults = await Promise.allSettled(attachmentPromises)
    return attachmentResults
      .filter(
        (result): result is PromiseFulfilledResult<AttachmentEntity> =>
          result.status === "fulfilled" && result.value !== null,
      )
      .map((result) => result.value)
  } catch (error) {
    logger.error(error, "Error getting message attachments")
    return []
  }
}

export const parseIncomingMessage = async ({
  ctx,
  data,
}: {
  ctx: Context<MessengerAuthValue>
  data: MessengerWebhookEvent
}): Promise<ReceivedMessageResult> => {
  const entry = data.entry[0]

  if (!entry.messaging[0]) {
    throw new MessengerException("No messaging found")
  }

  const messaging = entry.messaging[0]
  if (!(messaging.message || messaging.postback)) {
    throw new MessengerException("No message found")
  }

  const sourceId = entry.id
  const { message, postbackAction, quickReplyAction } = await getMessageEntity(
    ctx,
    messaging,
  )

  const conversation: ConversationEntity = {
    sourceId,
    conversationAttributes: {},
    contact: {
      sourceId:
        message.messageType === MessageType.outgoing
          ? messaging.recipient.id
          : messaging.sender.id,
    },
  }

  return {
    message,
    conversation,
    postbackAction,
    quickReplyAction,
    ref: null,
  }
}

const getMessageEntity = async (
  ctx: Context<MessengerAuthValue>,
  messaging: MessengerMessagingEvent,
): Promise<Omit<ReceivedMessageResult, "conversation">> => {
  let message: MessageEntity | null = null
  let postbackAction: string | null = null
  let quickReplyAction: string | null = null
  let ref: string | null = null

  if (messaging.message) {
    message = {
      sourceId: messaging.message.mid,
      messageType:
        messaging.sender.id === ctx.auth.metadata.pageId
          ? MessageType.outgoing
          : MessageType.incoming,
      content: messaging.message.text,
      contentType: ContentType.text,
      attachments: await getMessageAttachments(ctx, messaging.message),
    }
    quickReplyAction = messaging.message.quick_reply?.payload ?? null
  }

  if (messaging.postback) {
    message = {
      sourceId: messaging.postback.mid,
      messageType: MessageType.incoming,
      content: messaging.postback.title,
      contentType: ContentType.text,
    }
    postbackAction = messaging.postback.payload
  }

  if (messaging.referral) {
    ref = messaging.referral.ref
  }

  if (message) {
    return { message, postbackAction, quickReplyAction, ref }
  }

  throw new MessengerException("No message found")
}
