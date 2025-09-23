import {
  ContentType,
  type ConversationEntity,
  type MessageEntity,
} from "@aha.chat/sdk"
import type { ZaloWebhookEvent } from "./schemas/webhook"

export const parseIncomingMessage = (props: ZaloWebhookEvent) => {
  const message: MessageEntity = {
    sourceId: props.message?.msg_id ?? "",
    messageType: "INCOMING",
    content: props.message?.text ?? "",
    contentType: ContentType.TEXT,
  }
  const conversation: ConversationEntity = {
    sourceId: props.user_id_by_app ?? "",
    conversationAttributes: {},
    contact: {
      sourceId: props.sender.id,
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
