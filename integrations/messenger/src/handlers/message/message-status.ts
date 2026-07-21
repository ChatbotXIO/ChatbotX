import {
  type Context,
  contentTypes,
  type IncomingMessage,
  messageTypes,
  type ReceivedMessageResult,
} from "@chatbotx.io/sdk"
import { z } from "zod"
import type { MessengerAuthValue } from "../../schema"

const messengerMessageStatusPayloadSchema = z.object({
  contactSourceId: z.string().optional(),
  messageId: z.string(),
  status: z.enum(["delivered", "failed", "read"]),
  timestamp: z.string(),
})

export const handleMessageStatus = async (props: {
  ctx: Context<MessengerAuthValue>
  data: {
    integrationType: string
    integrationIdentifier: string
    payload: unknown
  }
}): Promise<ReceivedMessageResult | null> => {
  const payload = messengerMessageStatusPayloadSchema.parse(props.data.payload)
  const contactSourceId = payload.contactSourceId ?? payload.messageId

  const message: IncomingMessage = {
    sourceId: payload.messageId,
    messageType: messageTypes.enum.incoming,
    contentType: contentTypes.enum.text,
  }

  return await Promise.resolve({
    message,
    postbackAction: null,
    quickReplyAction: null,
    ref: null,
    contact: {
      sourceId: contactSourceId,
    },
  })
}
