import {
  ContentType,
  type ConversationEntity,
  type MessageEntity,
} from "@aha.chat/sdk"
import type { MessengerWebhookEvent } from "./schemas"

export const parseIncomingMessage = (props: MessengerWebhookEvent) => {
  const entry = props.entry[0]
  const messaging = entry.messaging[0]
  const sourceId = entry.id
  const message: MessageEntity = {
    sourceId: messaging.message?.is_echo
      ? messaging.recipient.id
      : messaging.sender.id,
    content: messaging.message?.text || "",
    contentType: ContentType.TEXT,
  }
  const conversation: ConversationEntity = {
    sourceId,
    conversationAttributes: {},
    contact: {
      sourceId: messaging.message?.is_echo
        ? messaging.recipient.id
        : messaging.sender.id,
      name: "",
    },
  }
  const postbackAction: { flowVersionId: string; buttonId: string } | null =
    null

  return Promise.resolve({ message, conversation, postbackAction })
}
