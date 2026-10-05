import {
  buildFacebookDialogUrl,
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  oauth2Auth,
  verifyGraphToken,
} from "@chatbotx.io/sdk"
import {
  debugToken,
  exchangeCodeForToken,
  getUserPages,
  MESSENGER_SCOPES,
  toAppAccessToken,
} from "./apis/auth"
import {
  getCommentAttachment,
  getCommentAttachmentType,
  getCommentMessageTags,
} from "./apis/comment"
import {
  type CloneMessengerTemplateProps,
  clonePageMessageTemplate,
  listPageMessageTemplates,
} from "./apis/message-templates"
import {
  deleteProfileFields,
  exchangeLongLivedToken,
  subscribePageToAppWebhook,
  syncPersonas,
  unsubscribePageFromAppWebhook,
} from "./apis/page"
import { getPostDetails } from "./apis/post"
import { getUserInboxLink } from "./apis/user-inbox-link"
import { DEFAULT_API_VERSION } from "./constants"
import { MessengerAPIException } from "./exception"
import { botHandlers } from "./handlers/bot"
import { commentHandlers } from "./handlers/comment"
import { contactHandlers } from "./handlers/contact"
import { conversationHandlers } from "./handlers/conversation"
import { messageHandlers } from "./handlers/message"
import { webhookHandler } from "./handlers/webhook"
import { isRevokedTokenError } from "./lib/error-mapper"
import { logger } from "./lib/logger"
import type {
  MessengerActions,
  MessengerAuthValue,
  MessengerConfig,
} from "./schema"

const config: IntegrationDefinition<
  MessengerConfig,
  MessengerAuthValue,
  MessengerActions
> = {
  name: "messenger",
  connection: {
    kind: "channel",
    strategy: "oauth_redirect",
    multiAccount: true,
    configFields: [],
    authorizeUrl: ({ credential, callbackUrl, state }) => {
      const config = credential as MessengerConfig
      return buildFacebookDialogUrl({
        authType: "rerequest",
        clientId: config.clientId,
        callbackUrl,
        scopes: MESSENGER_SCOPES,
        state,
        version: config.version,
      })
    },
    // Exchange failures abort the connection rather than persisting a
    // short-lived user token that may expire before page selection completes.
    exchangeCode: async ({ code, callbackUrl, credential }) => {
      const config = credential as MessengerConfig
      const shortLivedToken = await exchangeCodeForToken(
        config,
        code,
        callbackUrl,
      )
      const longLivedToken = await exchangeLongLivedToken(
        config,
        shortLivedToken,
      )
      return oauth2Auth(config, callbackUrl, {
        accessToken: longLivedToken,
      })
    },
    // One Graph call, no cache — provider lists already carry each page's
    // own access token (`getUserPages`), so no per-candidate follow-up call
    // is needed to build its final `MessengerAuthValue`.
    listCandidates: async ({ auth }) => {
      if (auth.authType !== "oauth2") {
        return []
      }
      const version = auth.version ?? DEFAULT_API_VERSION
      const { pages } = await getUserPages(auth.tokens.accessToken, version)
      return pages
        .filter((page) => page.isConnectable && page.access_token)
        .map((page) => ({
          sourceId: page.id,
          displayName: page.name,
          auth: oauth2Auth(
            auth,
            auth.redirectUrl,
            { accessToken: page.access_token as string },
            { pageId: page.id, pageName: page.name, version },
          ) satisfies MessengerAuthValue,
        }))
    },
    describe: (auth) => {
      if (!auth.metadata?.pageId) {
        throw new Error("Messenger auth has no page identity")
      }
      return {
        sourceId: auth.metadata.pageId,
        displayName: auth.metadata.pageName ?? "Messenger",
      }
    },
    verify: verifyGraphToken<MessengerAuthValue>({
      label: "Messenger",
      debugToken,
      isRevoked: isRevokedTokenError,
    }),
    isRevokedTokenError,
    webhook: {
      subscribe: ({ auth }) =>
        subscribePageToAppWebhook({
          pageId: auth.metadata.pageId,
          accessToken: auth.tokens.accessToken,
          version: auth.metadata.version,
        }),
      unsubscribe: ({ auth }) =>
        unsubscribePageFromAppWebhook({
          pageId: auth.metadata.pageId,
          appAccessToken: toAppAccessToken(auth),
          version: auth.metadata.version,
        }),
    },
  },
  channels: {
    channel: {
      message: messageHandlers,
      comment: commentHandlers,
      conversation: conversationHandlers,
      contact: contactHandlers,
      bot: botHandlers,
    },
  },
  actions: {
    syncPersonas,
    getPostDetails,
    getUserInboxLink,
    getCommentAttachmentType,
    getCommentAttachment,
    getCommentMessageTags,
    listMessageTemplates: async ({ ctx, input }) =>
      listPageMessageTemplates(ctx.auth, input),
    cloneMessageTemplate: async ({
      ctx,
      input,
    }: {
      ctx: { auth: MessengerAuthValue }
      input: CloneMessengerTemplateProps
    }) => clonePageMessageTemplate(ctx.auth, input),
  },
  handleRequest: async (props) => {
    const segments = new URL(props.req.url).pathname.split("/")
    const action = segments.pop()

    switch (action) {
      case HandleRequestType.webhook:
        return await webhookHandler(props)
      default:
        throw new MessengerAPIException(
          `${props.req.method} ${props.req.url} is not implemented`,
        )
    }
  },
  disconnect: async (auth: MessengerAuthValue): Promise<void> => {
    try {
      await deleteProfileFields({
        ctx: { auth },
        fields: ["persistent_menu"],
      })
    } catch (error) {
      logger.warn(
        { err: error },
        "Failed to clear Messenger persistent menu before disconnect",
      )
    }

    await unsubscribePageFromAppWebhook({
      pageId: auth.metadata.pageId,
      appAccessToken: `${auth.clientId}|${auth.clientSecret}`,
      version: auth.metadata.version,
    })
  },
  refreshAuth: async ({ auth }) => {
    const accessToken = await exchangeLongLivedToken(
      {
        clientId: auth.clientId,
        clientSecret: auth.clientSecret,
        version: auth.metadata.version,
      },
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
  IntegrationDefinition<MessengerConfig, MessengerAuthValue, MessengerActions>
>(config)
