import {
  AuthType,
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
} from "@chatbotx.io/sdk"
import {
  exchangeCodeForToken,
  getUserPages,
  MESSENGER_SCOPES,
  toAppAccessToken,
  verifyMetaToken,
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
  deleteMessengerProfileFields,
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
    // Bypasses `generateAuthUrl` deliberately: that helper base64-JSON-
    // encodes `stateParams` into the `state` query param for the legacy
    // per-request cookie flow, but the Connection domain's OAuth callback
    // hub matches `state` against a raw `"{sessionId}.{nonce}"` string —
    // wrapping it in JSON here would make every session-based Messenger
    // connect silently fall through to the legacy branch.
    authorizeUrl: ({ credential, callbackUrl, state }) => {
      const config = credential as MessengerConfig
      const params = new URLSearchParams({
        auth_type: "rerequest",
        client_id: config.clientId,
        redirect_uri: callbackUrl,
        scope: MESSENGER_SCOPES.join(","),
        response_type: "code",
        state,
      })
      return `https://www.facebook.com/${config.version}/dialog/oauth?${params.toString()}`
    },
    // Returns a *user*-level `AuthValue` (SDK-generalized, not `MessengerAuthValue`
    // — the exchanged token isn't tied to a page yet, so it can't carry
    // `metadata.pageId`). Mirrors the OAuth callback hub's existing
    // short-lived -> long-lived exchange, falling back to the short-lived
    // token on a failed long-lived exchange rather than failing the whole
    // connect (`apps/builder/src/app/integrations/[...integration]/callback.ts`).
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
      ).catch((error) => {
        logger.info(
          { err: error },
          "Messenger long-lived token exchange failed, using short-lived token",
        )
        return shortLivedToken
      })
      return {
        authType: AuthType.oauth2,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        // The real callback URL `authorizeUrl` sent as `redirect_uri` —
        // `oauth2AuthSchema.redirectUrl` is `min(1)`; a hardcoded `""` here
        // fails the first generic validator that parses this value (Google
        // Calendar's `.extend()` pattern already does).
        redirectUrl: callbackUrl,
        version: config.version,
        tokens: { accessToken: longLivedToken },
      }
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
          auth: {
            authType: AuthType.oauth2,
            clientId: auth.clientId,
            clientSecret: auth.clientSecret,
            redirectUrl: auth.redirectUrl,
            version,
            tokens: { accessToken: page.access_token as string },
            metadata: { pageId: page.id, pageName: page.name, version },
          } satisfies MessengerAuthValue,
        }))
    },
    describe: (auth) => ({
      sourceId: auth.metadata.pageId,
      displayName: auth.metadata.pageName,
    }),
    verify: verifyMetaToken("Messenger"),
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
      await deleteMessengerProfileFields({
        ctx: { auth },
        fields: ["persistent_menu"],
      })
    } catch (error) {
      logger.warn(
        {
          err: error instanceof Error ? error.message : String(error),
        },
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
