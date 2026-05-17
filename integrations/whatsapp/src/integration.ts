import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@chatbotx.io/sdk"
import {
  findConversationalAutomation,
  updateConversationalAutomation,
} from "./api/phone-number"
import { listFlows, listMessageTemplates } from "./api/waba"
import { unsubscribeWebhook } from "./api/webhook"
import { uploadMedia, verifyAccessToken } from "./client"
import { conversationHandlers } from "./handlers/conversation"
import { messageHandlers } from "./handlers/message"
import { webhookHandler } from "./handlers/webhook"
import type {
  WhatsappActions,
  WhatsappAuthValue,
  WhatsappConfig,
} from "./schema"

const config: IntegrationDefinition<
  WhatsappConfig,
  WhatsappAuthValue,
  WhatsappActions
> = {
  name: "whatsapp",
  channels: {
    channel: {
      message: messageHandlers,
      conversation: conversationHandlers,
    },
  },
  actions: {
    verifyAccessToken: async ({ ctx }) => await verifyAccessToken(ctx),
    uploadMedia: async ({ ctx, file }) => await uploadMedia(ctx.auth, file),
    listMessageTemplates: async ({ ctx }) =>
      await listMessageTemplates(ctx.auth),
    listFlows: async ({ ctx }) => await listFlows(ctx),
    findConversationalAutomation: async ({ ctx }) =>
      await findConversationalAutomation(ctx.auth),
    updateConversationalAutomation: async ({ ctx, data }) =>
      await updateConversationalAutomation(ctx.auth, data),
  },
  handleRequest: async (props) => {
    const segments = new URL(props.req.url).pathname.split("/")

    if (segments.includes(HandleRequestType.webhook)) {
      return await webhookHandler(props)
    }

    throw new SdkException(
      `Handler: ${props.req.method} ${props.req.url} is not implemented`,
    )
  },
  disconnect: async (auth: WhatsappAuthValue): Promise<void> => {
    await unsubscribeWebhook({ auth })
  },
}

export const integration = new Integration<
  IntegrationDefinition<WhatsappConfig, WhatsappAuthValue, WhatsappActions>
>(config)
