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
import { getWhatsappClient, uploadMedia, verifyAccessToken } from "./client"
import { webhookHandler } from "./handlers/webhook"
import { parseIncomingMessage } from "./incomming-message"
import { sendFlowStep, sendOutgoingMessage } from "./outgoing-message"
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
    sendFlowStep: async ({ ctx, flowVersionId, step, conversation }) => {
      await sendFlowStep(ctx, conversation, flowVersionId, step)
    },
    listMessageTemplates: async ({ ctx }) => {
      return await listMessageTemplates(ctx.auth)
    },
    listFlows: async ({ ctx }) => {
      return await listFlows(ctx)
    },
    findConversationalAutomation: async ({ ctx }) => {
      return await findConversationalAutomation(ctx.auth)
    },
    updateConversationalAutomation: async ({ ctx, data }) => {
      return await updateConversationalAutomation(ctx.auth, data)
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
