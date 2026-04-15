import {
  type Context,
  contentTypes,
  type IncomingAttachment,
  type IncomingContact,
  type IncomingMessage,
  type MessageHandlers,
  messageTypes,
  type ReceivedMessageResult,
} from "@chatbotx.io/sdk"
import { getMessageAttachmentEntity } from "../../apis/attachment"
import { MessengerException } from "../../exception"
import { logger } from "../../lib/logger"
import {
  type MessengerAuthValue,
  type MessengerMessage,
  type MessengerMessagingEvent,
  messengerWebhookEventSchema,
} from "../../schema"

const getMessageAttachments = async (
  ctx: Context<MessengerAuthValue>,
  message: MessengerMessage,
): Promise<IncomingAttachment[]> => {
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
        (result): result is PromiseFulfilledResult<IncomingAttachment> =>
          result.status === "fulfilled" && result.value !== null,
      )
      .map((result) => result.value)
  } catch (error) {
    logger.error(error, "Error getting message attachments")
    return []
  }
}

export const receiveMessage: MessageHandlers<MessengerAuthValue>["receiveMessage"] =
  async (props) => {
    const { ctx, data } = props
    const validatedData = messengerWebhookEventSchema.parse(data.payload)

    const entry = validatedData.entry[0]

    if (!entry.messaging[0]) {
      throw new MessengerException("No messaging found")
    }

    const messaging = entry.messaging[0]
    if (!(messaging.message || messaging.postback || messaging.referral)) {
      throw new MessengerException("No message found")
    }

    const { message, postbackAction, quickReplyAction, ref } =
      await getMessageEntity(ctx, messaging)

    const sourceId =
      message.messageType === messageTypes.enum.outgoing
        ? messaging.recipient.id
        : messaging.sender.id
    const contact: IncomingContact = {
      sourceId,
    }

    return {
      message,
      contact,
      postbackAction,
      quickReplyAction,
      ref,
    }
  }

const getMessageEntity = async (
  ctx: Context<MessengerAuthValue>,
  messaging: MessengerMessagingEvent,
): Promise<Omit<ReceivedMessageResult, "contact">> => {
  let message: IncomingMessage | null = null
  let postbackAction: string | null = null
  let quickReplyAction: string | null = null
  let ref: string | null = null

  if (messaging.message) {
    message = {
      sourceId: messaging.message.mid,
      messageType:
        messaging.sender.id === ctx.auth.metadata.pageId
          ? messageTypes.enum.outgoing
          : messageTypes.enum.incoming,
      text: messaging.message.text,
      contentType: contentTypes.enum.text,
      attachments: await getMessageAttachments(ctx, messaging.message),
    }
    quickReplyAction = messaging.message.quick_reply?.payload ?? null
  }

  if (messaging.postback) {
    message = {
      sourceId: messaging.postback.mid,
      messageType: messageTypes.enum.incoming,
      text: messaging.postback.title,
      contentType: contentTypes.enum.text,
    }
    postbackAction = messaging.postback.payload
  }

  if (messaging.referral) {
    ref = messaging.referral.ref
    message = {
      sourceId: messaging.referral.ref,
      messageType: messageTypes.enum.incoming,
      text: messaging.referral.ref,
      contentType: contentTypes.enum.refLink,
    }
  }

  if (message) {
    return { message, postbackAction, quickReplyAction, ref }
  }

  throw new MessengerException("No message found")
}
