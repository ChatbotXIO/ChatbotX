import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@ahachat.ai/sdk"
import { getWhatsappClient, uploadMedia, verifyAccessToken } from "./client.js"
import { webhookHandler } from "./handlers/webhook.js"
import { parseIncomingMessage } from "./incomming-message.js"
import type {
  WhatsappActions,
  WhatsappAuthValue,
  WhatsappConfig,
} from "./schemas.js"
import { sendOutgoingMessage } from "./outgoing-message.js"
import { getIceBreakers, updateIceBreaker } from "./ice-breaker.js"
import { createTemplate, getTemplates } from "./message-templates.js"
import { getFlows } from "./flows.js"

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
    uploadMedia: async ({ ctx, file }) => {
      return await uploadMedia(ctx.auth, file)
    },
    receiveMessage: async ({ ctx, data }) => {
      const whatsappClient = getWhatsappClient(ctx.auth)

      return await parseIncomingMessage(ctx, whatsappClient, data)
    },
    sendMessage: async ({ ctx, message, conversation, flowVersion }) => {
      await sendOutgoingMessage(ctx, conversation, message, flowVersion)
    },
    getTemplates: async ({ ctx, params }) => {
      return await getTemplates(ctx.auth, params)
    },
    createTemplate: async ({ ctx, body }) => {
      return await createTemplate(ctx.auth, body)
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
}

export const integration = new Integration(config)
