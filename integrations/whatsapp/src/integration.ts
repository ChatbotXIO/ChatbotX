import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@aha.chat/sdk"
import {
  findConversationalAutomation,
  updateConversationalAutomation,
} from "./api/phone-number"
import { listFlows, listMessageTemplates } from "./api/waba"
import { uploadMedia, verifyAccessToken } from "./client"
import { agentMarkAsRead, sendTyping } from "./conversation"
import { webhookHandler } from "./handlers/webhook"
import { receiveMessage } from "./incomming-message"
import { sendFlowStep, sendMessage } from "./outgoing-message"
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
  channels: {
    channel: {
      message: {
        receiveMessage,
        sendMessage,
      },
      conversation: {
        sendTyping,
        agentMarkAsRead,
      },
    },
  },
  actions: {
    verifyAccessToken: async ({ ctx }) => await verifyAccessToken(ctx),
    uploadMedia: async ({ ctx, file }) => await uploadMedia(ctx.auth, file),
    sendFlowStep: async (props) => {
      return await sendFlowStep(props)
    },
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
  disconnect: (_props: WhatsappAuthValue): Promise<void> => {
    throw new Error("Method is not implemented.")
  },
}

export const integration = new Integration<
  IntegrationDefinition<WhatsappConfig, WhatsappAuthValue, WhatsappActions>
>(config)
