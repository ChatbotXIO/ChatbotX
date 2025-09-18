import {
  ContentType,
  type ConversationEntity,
  type MessageEntity,
  SdkException,
} from "@aha.chat/sdk"
import type { MessengerWebhookEvent } from "./schemas"

export const parseIncomingMessage = (props: MessengerWebhookEvent) => {
  const entry = props.entry[0]

  if (!entry.messaging[0]) {
    throw new SdkException("No messaging found")
  }

  const messaging = entry.messaging[0]
  if (!messaging.message) {
    throw new SdkException("No message found")
  }

  const sourceId = entry.id
  const message: MessageEntity = {
    sourceId: messaging.message.mid,
    messageType: messaging.message.is_echo ? "OUTGOING" : "INCOMING",
    content: messaging.message.text,
    contentType: ContentType.TEXT,
  }
  const conversation: ConversationEntity = {
    sourceId,
    conversationAttributes: {},
    contact: {
      sourceId: messaging.message?.is_echo
        ? messaging.recipient.id
        : messaging.sender.id,
    },
  }
  const postbackAction: { flowVersionId: string; buttonId: string } | null =
    null

  return Promise.resolve({ message, conversation, postbackAction })
}
