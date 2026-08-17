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
      // BSUID fallback: a status for a message sent via `recipient` (BSUID)
      // carries an empty `phone`/`recipient_id`; the worker's single
      // ContactInbox lookup still resolves because a BSUID-keyed row's
      // `sourceId` IS the BSUID (see D2 in the BSUID plan).
      sourceId: data.phone || data.recipientUserId || "",
      phoneNumber: data.phone,
      phoneNumberId: data.phoneID,
    },
  })
}
