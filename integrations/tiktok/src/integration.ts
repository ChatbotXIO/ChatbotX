import {
  AuthException,
  AuthType,
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
} from "@chatbotx.io/sdk"
import { exchangeCodeForToken, refreshAccessToken } from "./apis/auth"
import { getUserInfo } from "./apis/user"
import { TiktokAPIException } from "./exception"
import { callbackHandler } from "./handlers/callback"
import { contactHandlers } from "./handlers/contact"
import { conversationHandlers } from "./handlers/conversation"
import { messageHandlers } from "./handlers/message"
import { webhookHandler } from "./handlers/webhook"
import { isRevokedTokenError } from "./lib/error-mapper"
import { buildTokenTimestamps } from "./lib/token-utils"
import type { TiktokActions, TiktokAuthValue, TiktokConfig } from "./schema"

const TIKTOK_SCOPES = [
  "user.info.basic",
  "user.info.username",
  "user.info.profile",
  "user.info.stats",
  "user.account.type",
  "message.list.read",
  "message.list.send",
  "message.list.manage",
].join(",")

const config: IntegrationDefinition<
  TiktokConfig,
  TiktokAuthValue,
  TiktokActions
> = {
  name: "tiktok",
  channels: {
    channel: {
      message: messageHandlers,
      conversation: conversationHandlers,
      contact: contactHandlers,
    },
  },
  actions: {},
  connection: {
    kind: "channel",
    strategy: "oauth_redirect",
    multiAccount: true,
    configFields: [],
    // Bypasses `generateAuthUrl` deliberately: it base64-JSON-encodes
    // `stateParams` for the legacy per-request cookie flow, but the
    // Connection domain callback hub matches a raw `"{sessionId}.{nonce}"`.
    authorizeUrl: ({ credential, callbackUrl, state }) => {
      const config = credential as TiktokConfig
      const params = new URLSearchParams({
        client_key: config.clientId,
        response_type: "code",
        scope: TIKTOK_SCOPES,
        redirect_uri: callbackUrl,
        disable_auto_auth: "1",
        state,
      })
      return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`
    },
    exchangeCode: async ({ code, callbackUrl, credential }) => {
      const config = credential as TiktokConfig
      const tokenResponse = await exchangeCodeForToken(
        {
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          redirectUrl: callbackUrl,
        },
        code,
      )
      const userInfo = await getUserInfo({
        accessToken: tokenResponse.access_token,
      })

      return {
        authType: AuthType.oauth2,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUrl: "",
        tokens: {
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          ...buildTokenTimestamps(
            tokenResponse.expires_in,
            tokenResponse.refresh_expires_in,
          ),
        },
        metadata: {
          openId: tokenResponse.open_id,
          username: userInfo.username,
          displayName: userInfo.display_name,
        },
      } satisfies TiktokAuthValue
    },
    describe: (auth) => ({
      sourceId: auth.metadata.openId,
      displayName:
        auth.metadata.displayName || auth.metadata.username || "TikTok",
    }),
    verify: async ({ auth }) => {
      try {
        await getUserInfo({ accessToken: auth.tokens.accessToken })
        return { ok: true, authExpiresAt: auth.tokens.expiresAt }
      } catch (error) {
        return {
          ok: false,
          revoked: isRevokedTokenError(error),
          error:
            error instanceof Error
              ? error.message
              : "Unable to verify TikTok connection",
        }
      }
    },
    isRevokedTokenError,
  },
  refreshAuth: async ({ auth }) => {
    if (!auth.tokens.refreshToken) {
      throw new AuthException("TikTok refresh token not available")
    }
    const newTokens = await refreshAccessToken(
      { clientId: auth.clientId, clientSecret: auth.clientSecret },
      auth.tokens.refreshToken,
    )
    return {
      ...auth,
      tokens: {
        ...auth.tokens,
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token,
        ...buildTokenTimestamps(
          newTokens.expires_in,
          newTokens.refresh_expires_in,
        ),
      },
    }
  },
  handleRequest: async (props) => {
    const segments = new URL(props.req.url).pathname.split("/")
    const action = segments.pop()

    switch (action) {
      case HandleRequestType.webhook:
        return await webhookHandler(props)
      case HandleRequestType.callback:
        return await callbackHandler(props)
      default:
        throw new TiktokAPIException(
          `${props.req.method} ${props.req.url} is not implemented`,
        )
    }
  },
  disconnect: async (_auth: TiktokAuthValue): Promise<void> => {
    // TikTok webhooks are configured in the developer portal — nothing to call
  },
}

export const integration = new Integration<
  IntegrationDefinition<TiktokConfig, TiktokAuthValue, TiktokActions>
>(config)
