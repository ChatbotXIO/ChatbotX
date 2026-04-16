import {
  ContentType,
  type Context,
  type IncomingConversation,
  type IncomingMessage,
  MessageType,
  type ReceivedMessageResult,
} from "@aha.chat/sdk"
import type { WhatsappAuthValue, WhatsappStatusWebhookEvent } from "./schemas"

export const handleMessageStatus = async (props: {
  ctx: Context<WhatsappAuthValue>

  data: {
    integrationType: string
    integrationIdentifier: string
    payload: unknown
  }
}): Promise<ReceivedMessageResult | null> => {
  const {
    data: { payload },
  } = props
  const data = payload as WhatsappStatusWebhookEvent

  const conversation: IncomingConversation = {
    sourceId: data.phone,
    conversationAttributes: {
      phoneNumberId: data.phoneID,
    },
    contact: {
      sourceId: data.phone,
    },
  }

  const message: IncomingMessage = {
    sourceId: data.messageId,
    messageType: MessageType.incoming,
    contentType: ContentType.text,
  }

  return await Promise.resolve({
    message,
    conversation,
    postbackAction: null,
    quickReplyAction: null,
    ref: null,
  })
}
