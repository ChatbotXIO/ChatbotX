import {
  AuthType,
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
} from "@chatbotx.io/sdk"
import {
  debugToken,
  exchangeCodeForToken,
  getUserInstagramAccounts,
  toAppAccessToken,
} from "./apis/auth"
import {
  exchangeLongLivedToken,
  subscribePageToInstagramWebhook,
  unsubscribePageFromInstagramWebhook,
} from "./apis/page"
import { getPostDetails } from "./apis/post"
import { DEFAULT_API_VERSION } from "./constants"
import { InstagramAPIException } from "./exception"
import { botHandlers } from "./handlers/bot"
import { commentHandlers } from "./handlers/comment"
import { contactHandlers } from "./handlers/contact"
import { conversationHandlers } from "./handlers/conversation"
import { messageHandlers } from "./handlers/message"
import { webhookHandler } from "./handlers/webhook"
import { isRevokedTokenError } from "./lib/error-mapper"
import type {
  InstagramActions,
  InstagramAuthValue,
  InstagramConfig,
} from "./schemas"

const INSTAGRAM_OAUTH_SCOPES = [
  "instagram_basic",
  "instagram_manage_comments",
  "instagram_manage_engagement",
  "instagram_manage_messages",
  "instagram_manage_events",
  "pages_manage_metadata",
  "pages_show_list",
  "pages_messaging",
  "pages_read_engagement",
  "business_management",
]

const config: IntegrationDefinition<
  InstagramConfig,
  InstagramAuthValue,
  InstagramActions
> = {
  name: "instagramFacebook",
  connection: {
    kind: "channel",
    strategy: "oauth_redirect",
    multiAccount: true,
    configFields: [],
    authorizeUrl: ({ credential, callbackUrl, state }) => {
      const config = credential as InstagramConfig
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: callbackUrl,
        response_type: "code",
        scope: INSTAGRAM_OAUTH_SCOPES.join(","),
        state,
      })
      return `https://www.facebook.com/${config.version}/dialog/oauth?${params.toString()}`
    },
    exchangeCode: async ({ code, callbackUrl, credential }) => {
      const config = credential as InstagramConfig
      const accessToken = await exchangeCodeForToken(config, code, callbackUrl)
      return {
        authType: AuthType.oauth2,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUrl: "",
        version: config.version,
        tokens: { accessToken },
      }
    },
    listCandidates: async ({ auth }) => {
      if (auth.authType !== AuthType.oauth2) {
        return []
      }

      const version = auth.version ?? DEFAULT_API_VERSION
      const accounts = await getUserInstagramAccounts(
        auth.tokens.accessToken,
        version,
      )
      return accounts.map((account) => ({
        sourceId: account.id,
        displayName: account.name,
        auth: {
          authType: AuthType.oauth2,
          clientId: auth.clientId,
          clientSecret: auth.clientSecret,
          redirectUrl: "",
          version,
          tokens: { accessToken: account.pageAccessToken },
          metadata: {
            igId: account.id,
            igName: account.name,
            pageId: account.pageId,
            version,
            username: account.username,
          },
        } satisfies InstagramAuthValue,
      }))
    },
    candidateToConfig: (auth) => ({
      pageId: auth.metadata.pageId,
      username: auth.metadata.username,
    }),
    describe: (auth) => ({
      sourceId: auth.metadata.igId,
      displayName: auth.metadata.igName,
    }),
    verify: async ({ auth }) => {
      const token = await debugToken({
        inputToken: auth.tokens.accessToken,
        appAccessToken: toAppAccessToken(auth),
        version: auth.metadata.version,
      })

      if (token.is_valid !== true) {
        return {
          ok: false,
          revoked: true,
          error: "Instagram access token is invalid",
        }
      }

      return { ok: true, authExpiresAt: auth.tokens.expiresAt }
    },
    isRevokedTokenError,
    webhook: {
      subscribe: ({ auth }) =>
        subscribePageToInstagramWebhook({
          pageId: auth.metadata.pageId,
          accessToken: auth.tokens.accessToken,
          version: auth.metadata.version,
        }),
      unsubscribe: ({ auth }) =>
        unsubscribePageFromInstagramWebhook({
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
    getPostDetails,
  },
  handleRequest: async (props) => {
    const segments = new URL(props.req.url).pathname.split("/")
    const action = segments.pop()

    switch (action) {
      case HandleRequestType.webhook:
        return await webhookHandler(props)
      default:
        throw new InstagramAPIException(
          `${props.req.method} ${props.req.url} is not implemented`,
        )
    }
  },
  disconnect: async (auth: InstagramAuthValue): Promise<void> => {
    await unsubscribePageFromInstagramWebhook({
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
  IntegrationDefinition<InstagramConfig, InstagramAuthValue, InstagramActions>
>(config)
