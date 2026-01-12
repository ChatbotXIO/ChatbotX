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
    verifyAccessToken: async ({ ctx }) => await verifyAccessToken(ctx),
    uploadMedia: async ({ ctx, file }) => await uploadMedia(ctx.auth, file),
    receiveMessage: async ({ ctx, data }) => {
      const whatsappClient = getWhatsappClient(ctx.auth)

      return await parseIncomingMessage(ctx, whatsappClient, data)
    },
    sendMessage: async ({ ctx, message, conversation }) => {
      await sendOutgoingMessage(ctx, conversation, message)
    },
    sendFlowStep: async ({
      ctx,
      flowId,
      flowVersionId,
      step,
      conversation,
    }) => {
      await sendFlowStep(ctx, conversation, flowId, flowVersionId, step)
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
    throw new Error("Function not implemented.")
  },
}

export const integration = new Integration<
  IntegrationDefinition<WhatsappConfig, WhatsappAuthValue, WhatsappActions>
>(config)
