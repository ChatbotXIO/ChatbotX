import {
  AuthType,
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
} from "@chatbotx.io/sdk"
import { exchangeCodeForToken, getInstagramAccount } from "./apis/auth"
import {
  refreshLongLivedToken,
  subscribePageToInstagramWebhook,
  unsubscribePageFromInstagramWebhook,
} from "./apis/page"
import { getPostDetails } from "./apis/post"
import { INSTAGRAM_BUSINESS_SCOPES } from "./constants"
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

const config: IntegrationDefinition<
  InstagramConfig,
  InstagramAuthValue,
  InstagramActions
> = {
  name: "instagram",
  connection: {
    kind: "channel",
    strategy: "oauth_redirect",
    multiAccount: true,
    configFields: [],
    // Bypasses `generateAuthUrl` deliberately: it base64-JSON-encodes
    // `stateParams` into the `state` query param for the legacy per-request
    // cookie flow, but the Connection domain's OAuth callback hub matches
    // `state` against a raw `"{sessionId}.{nonce}"` string.
    authorizeUrl: ({ credential, callbackUrl, state }) => {
      const config = credential as InstagramConfig
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: callbackUrl,
        response_type: "code",
        state,
        scope: INSTAGRAM_BUSINESS_SCOPES.join(","),
      })
      return `https://www.instagram.com/oauth/authorize?${params.toString()}`
    },
    // Instagram Business Login authorizes exactly one account per grant —
    // `exchangeCodeForToken` already returns a long-lived, account-scoped
    // token (unlike Messenger's user-level token), so this resolves the
    // full `InstagramAuthValue` directly and no `listCandidates` is needed;
    // `completeAuthorization`'s single-candidate fallback
    // (`[{...describe(auth), auth}]`) covers it. `username` has no default
    // on `IntegrationInstagram` and isn't part of `describe()`'s
    // `{sourceId,displayName}`, so it rides along in `metadata` for
    // `candidateToConfig` to surface.
    exchangeCode: async ({ code, callbackUrl, credential }) => {
      const config = credential as InstagramConfig
      const { accessToken, userId } = await exchangeCodeForToken(
        config,
        code,
        callbackUrl,
      )
      const account = await getInstagramAccount(accessToken)
      if (!account) {
        throw new Error(
          "Instagram account is not a supported Business/Creator account.",
        )
      }
      return {
        authType: AuthType.oauth2,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUrl: "",
        version: config.version,
        tokens: { accessToken },
        metadata: {
          igId: userId,
          igName: account.name,
          pageId: account.id,
          version: config.version,
          username: account.username,
        },
      } satisfies InstagramAuthValue
    },
    candidateToConfig: (auth) => ({ username: auth.metadata.username }),
    describe: (auth) => ({
      sourceId: auth.metadata.igId,
      displayName: auth.metadata.igName,
    }),
    verify: async ({ auth }) => {
      const account = await getInstagramAccount(auth.tokens.accessToken)

      if (!account || account.id !== auth.metadata.igId) {
        return {
          ok: false,
          revoked: false,
          error: "Instagram account could not be verified",
        }
      }

      return { ok: true, authExpiresAt: auth.tokens.expiresAt }
    },
    isRevokedTokenError,
    webhook: {
      subscribe: ({ auth }) =>
        subscribePageToInstagramWebhook({
          igId: auth.metadata.igId,
          accessToken: auth.tokens.accessToken,
          version: auth.metadata.version,
        }),
      unsubscribe: ({ auth }) =>
        unsubscribePageFromInstagramWebhook({
          igId: auth.metadata.igId,
          accessToken: auth.tokens.accessToken,
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
      igId: auth.metadata.igId,
      accessToken: auth.tokens.accessToken,
      version: auth.metadata.version,
    })
  },
  refreshAuth: async ({ auth }) => {
    const refreshed = await refreshLongLivedToken(auth.tokens.accessToken)
    return {
      ...auth,
      tokens: {
        ...auth.tokens,
        accessToken: refreshed.access_token,
        expiresAt: new Date(
          Date.now() + refreshed.expires_in * 1000,
        ).toISOString(),
      },
    }
  },
}

export const integration = new Integration<
  IntegrationDefinition<InstagramConfig, InstagramAuthValue, InstagramActions>
>(config)
