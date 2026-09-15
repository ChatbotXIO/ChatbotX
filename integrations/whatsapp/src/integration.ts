import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@chatbotx.io/sdk"
import { exchangeLongLivedToken } from "./api/auth"
import { getFlowAssets } from "./api/flow"
import {
  findConversationalAutomation,
  updateConversationalAutomation,
} from "./api/phone-number"
import { listFlows, listMessageTemplates } from "./api/waba"
import { subscribeWebhook, unsubscribeWebhook } from "./api/webhook"
import { uploadMedia, verifyAccessToken } from "./client"
import { botHandlers } from "./handlers/bot"
import { conversationHandlers } from "./handlers/conversation"
import { messageHandlers } from "./handlers/message"
import { webhookHandler } from "./handlers/webhook"
import { isRevokedTokenError } from "./lib/error-mapper"
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
      bot: botHandlers,
    },
  },
  actions: {
    verifyAccessToken: async ({ ctx }) => await verifyAccessToken(ctx),
    uploadMedia: async ({ ctx, file }) => await uploadMedia(ctx.auth, file),
    listMessageTemplates: async ({ ctx }) =>
      await listMessageTemplates(ctx.auth),
    listFlows: async ({ ctx }) => await listFlows(ctx),
    getFlowAssets: async ({ ctx, params }) =>
      await getFlowAssets({
        auth: ctx.auth,
        flowSourceId: params.flowSourceId,
      }),
    findConversationalAutomation: async ({ ctx }) =>
      await findConversationalAutomation(ctx.auth),
    updateConversationalAutomation: async ({ ctx, data }) =>
      await updateConversationalAutomation(ctx.auth, data),
  },
  connection: {
    kind: "channel",
    strategy: "oauth_redirect",
    multiAccount: true,
    configFields: [],
    describe: (auth) => ({
      sourceId: auth.metadata.phoneNumber.id,
      displayName:
        auth.metadata.phoneNumber.verified_name ||
        auth.metadata.phoneNumber.display_phone_number ||
        "WhatsApp",
    }),
    verify: async ({ auth }) => {
      try {
        await verifyAccessToken({
          auth,
        } as Parameters<typeof verifyAccessToken>[0])
        return { ok: true, authExpiresAt: auth.tokens.expiresAt }
      } catch (error) {
        return {
          ok: false,
          revoked: isRevokedTokenError(error),
          error:
            error instanceof Error
              ? error.message
              : "Unable to verify WhatsApp connection",
        }
      }
    },
    isRevokedTokenError,
    webhook: {
      subscribe: async ({ auth }) => await subscribeWebhook({ auth }),
      unsubscribe: async ({ auth }) => await unsubscribeWebhook({ auth }),
    },
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
  refreshAuth: async ({ auth }) => {
    const accessToken = await exchangeLongLivedToken(
      { clientId: auth.clientId, clientSecret: auth.clientSecret },
      auth.tokens.accessToken,
    )
    return {
      ...auth,
      tokens: {
        ...auth.tokens,
        accessToken,
      },
    }
  },
}

export const integration = new Integration<
  IntegrationDefinition<WhatsappConfig, WhatsappAuthValue, WhatsappActions>
>(config)
