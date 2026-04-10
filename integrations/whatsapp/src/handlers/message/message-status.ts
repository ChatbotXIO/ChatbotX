import {
  type Context,
  contentTypes,
  type IncomingConversation,
  type IncomingMessage,
  messageTypes,
  type ReceivedMessageResult,
} from "@chatbotx.io/sdk"
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
    additionalAttributes: {
      phoneNumberId: data.phoneID,
    },
    contact: {
      sourceId: data.phone,
    },
  }

  const message: IncomingMessage = {
    sourceId: data.messageId,
    messageType: messageTypes.enum.incoming,
    contentType: contentTypes.enum.text,
  }

  return await Promise.resolve({
    message,
    conversation,
    postbackAction: null,
    quickReplyAction: null,
    ref: null,
  })
}
