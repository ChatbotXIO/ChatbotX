import {
  type Context,
  contentTypes,
  type IncomingMessage,
  messageTypes,
  type ReceivedMessageResult,
} from "@chatbotx.io/sdk"
import type {
  WhatsappAuthValue,
  WhatsappStatusWebhookEvent,
} from "../../schema"

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

  const message: IncomingMessage = {
    sourceId: data.messageId,
    messageType: messageTypes.enum.incoming,
    contentType: contentTypes.enum.text,
  }

  return await Promise.resolve({
    message,
    postbackAction: null,
    quickReplyAction: null,
    ref: null,
    contact: {
      sourceId: data.phone,
      phoneNumber: data.phone,
      phoneNumberId: data.phoneID,
    },
  })
}
