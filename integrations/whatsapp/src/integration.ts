import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@ahachat.ai/sdk"
import { getWhatsappClient, uploadMedia, verifyAccessToken } from "./client"
import { getFlows } from "./flows"
import { webhookHandler } from "./handlers/webhook"
import { getIceBreakers, updateIceBreaker } from "./ice-breaker"
import { parseIncomingMessage } from "./incomming-message"
import {
  createMessageTemplate,
  listMessageTemplates,
} from "./message-templates"
import { sendOutgoingMessage } from "./outgoing-message"
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
      return await verifyAccessToken(ctx)
    },
    uploadMedia: async ({ ctx, file }) => {
      return await uploadMedia(ctx.auth, file)
    },
    receiveMessage: async ({ ctx, data }) => {
      const whatsappClient = getWhatsappClient(ctx.auth)

      return await parseIncomingMessage(ctx, whatsappClient, data)
    },
    sendMessage: async ({ ctx, message, conversation }) => {
      await sendOutgoingMessage(ctx, conversation, message)
    },
    listMessageTemplates: async ({ ctx, params }) => {
      return await listMessageTemplates(ctx.auth, params)
    },
    createMessageTemplate: async ({ ctx, data }) => {
      return await createMessageTemplate(ctx.auth, data)
    },
    getFlows: async ({ ctx, params }) => {
      return await getFlows(ctx.auth, params)
    },
    getIceBreakers: async ({ ctx }) => {
      return await getIceBreakers(ctx.auth)
    },
    updateIceBreaker: async ({ ctx, prompts }) => {
      return await updateIceBreaker(ctx.auth, prompts)
    },
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
  disconnect: (_props: WhatsappAuthValue): Promise<void> => {
    throw new Error("Function not implemented.")
  },
}

export const integration = new Integration<
  IntegrationDefinition<WhatsappConfig, WhatsappAuthValue, WhatsappActions>
>(config)
