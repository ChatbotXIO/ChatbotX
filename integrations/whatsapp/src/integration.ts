import {
  type Context,
  type ConversationEntity,
  type Handler,
  HandlerType,
  Integration,
  type IntegrationDefinition,
  type MessageEntity,
  SdkException,
} from "@ahachat.ai/sdk"
import type { OnMessageArgs } from "whatsapp-api-js/emitters"
import { getWhatsappClient, verifyAccessToken } from "./client"
import { webhookHandler } from "./handlers/webhook"
import { parseIncomingMessage } from "./incomming-message"
import type { WhatsappAuthValue, WhatsappConfig } from "./schemas"

type WhatsappIntegrationDefinition = IntegrationDefinition<
  WhatsappAuthValue,
  WhatsappConfig
> & {
  actions: {
    verifyAccessToken: Handler<{ ctx: Context<WhatsappAuthValue> }, string>
    receiveMessage: Handler<
      { ctx: Context<WhatsappAuthValue>; data: OnMessageArgs },
      { message: MessageEntity; conversation: ConversationEntity }
    >
    // sendMessage: (props: SendMessageProps) => Promise<void>
  }
}

export const integration = new Integration<
  WhatsappAuthValue,
  WhatsappConfig,
  WhatsappIntegrationDefinition
>({
  name: "whatsapp",
  actions: {
    verifyAccessToken: async ({ ctx }) => {
      return await verifyAccessToken(ctx.auth)
    },
    receiveMessage: async ({ ctx, data }) => {
      const whatsappClient = getWhatsappClient(ctx.auth)

      return await parseIncomingMessage(ctx, whatsappClient, data)
    },
    // sendMessage: async ({ ctx, message, conversation }) => {
    //   await sendOutgoingMessage(ctx, conversation, message)
    // },
  },
  handleRequest: async (props) => {
    const segments = new URL(props.req.url).pathname.split("/")

    if (segments.includes(HandlerType.WEBHOOK)) {
      return await webhookHandler(props)
    }

    throw new SdkException(
      `Handler: ${props.req.method} ${props.req.url} is not implemented`,
    )
  },
})
