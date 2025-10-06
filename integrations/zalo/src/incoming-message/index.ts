import {
  ContentType,
  type ConversationEntity,
  type MessageEntity,
  MessageType,
} from "@aha.chat/sdk"
import type { ZaloWebhookEvent } from "../schemas/webhook"

export const parseIncomingMessage = (event: ZaloWebhookEvent) => {
  if (!event.message) {
    return null
  }

  const message: MessageEntity = {
    sourceId: event.message.msg_id,
    messageType:
      event.event_name === "oa_send_msg"
        ? MessageType.OUTGOING
        : MessageType.INCOMING,
    content: event.message?.text,
    contentType: ContentType.TEXT,
  }
  const conversation: ConversationEntity = {
    sourceId: event.user_id_by_app,
    conversationAttributes: {},
    contact: {
      sourceId: event.sender.id,
    },
  }
  const postbackAction: { flowVersionId: string; buttonId: string } | null =
    null

  return Promise.resolve({
    message,
    conversation,
    postbackAction,
  })
}
