import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@ahachat.ai/sdk"
import { getWhatsappClient, verifyAccessToken } from "./client"
import { webhookHandler } from "./handlers/webhook"
import { parseIncomingMessage } from "./incomming-message"
import type {
  WhatsappActions,
  WhatsappAuthValue,
  WhatsappConfig,
} from "./schemas"

const config: IntegrationDefinition<
  WhatsappConfig,
  WhatsappAuthValue,
  WhatsappActions
> = {
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

    if (segments.includes(HandleRequestType.WEBHOOK)) {
      return await webhookHandler(props)
    }

    throw new SdkException(
      `Handler: ${props.req.method} ${props.req.url} is not implemented`,
    )
  },
}

export const integration = new Integration(config)
