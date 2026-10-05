import {
  AuthException,
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  oauth2Auth,
  probeVerify,
} from "@chatbotx.io/sdk"
import { exchangeCodeForToken, refreshAccessToken } from "./apis/auth"
import { getUserInfo } from "./apis/user"
import { TiktokAPIException, TiktokMissingScopesError } from "./exception"
import { callbackHandler } from "./handlers/callback"
import { commentHandlers } from "./handlers/comment"
import { contactHandlers } from "./handlers/contact"
import { conversationHandlers } from "./handlers/conversation"
import { messageHandlers } from "./handlers/message"
import { webhookHandler } from "./handlers/webhook"
import { isRevokedTokenError } from "./lib/error-mapper"
import {
  findMissingTiktokScopes,
  parseTiktokScopes,
  TIKTOK_COMMENT_AUTOMATION_SCOPES,
  TIKTOK_CORE_SCOPES,
  TIKTOK_OPTIONAL_PROFILE_SCOPES,
} from "./lib/scopes"
import { buildTokenTimestamps } from "./lib/token-utils"
import type { TiktokActions, TiktokAuthValue, TiktokConfig } from "./schema"

const TIKTOK_SCOPES = [
  ...TIKTOK_CORE_SCOPES,
  ...TIKTOK_OPTIONAL_PROFILE_SCOPES,
  ...TIKTOK_COMMENT_AUTOMATION_SCOPES,
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
      comment: commentHandlers,
    },
  },
  actions: {},
  connection: {
    kind: "channel",
    strategy: "oauth_redirect",
    multiAccount: false,
    configFields: [],
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
      const grantedScopes = parseTiktokScopes(tokenResponse.scope)
      const missingCoreScopes = findMissingTiktokScopes(
        grantedScopes,
        TIKTOK_CORE_SCOPES,
      )
      if (missingCoreScopes.length > 0) {
        throw new TiktokMissingScopesError(missingCoreScopes)
      }

      const userInfo = await getUserInfo({
        accessToken: tokenResponse.access_token,
      })

      return oauth2Auth(
        config,
        callbackUrl,
        {
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          ...buildTokenTimestamps(
            tokenResponse.expires_in,
            tokenResponse.refresh_expires_in,
          ),
        },
        {
          openId: tokenResponse.open_id,
          username: userInfo.username,
          displayName: userInfo.display_name,
          scopes: grantedScopes,
        },
      ) satisfies TiktokAuthValue
    },
    describe: (auth) => ({
      sourceId: auth.metadata.openId,
      displayName:
        auth.metadata.displayName || auth.metadata.username || "TikTok",
    }),
    verify: async ({ auth }) =>
      await probeVerify(
        () => getUserInfo({ accessToken: auth.tokens.accessToken }),
        {
          label: "TikTok connection",
          expiresAt: auth.tokens.expiresAt,
          isRevoked: isRevokedTokenError,
        },
      ),
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
      // A refresh never grants a new scope, but it does report the current set
      // — which is how a connection made before scopes were recorded stops
      // being reported as "unknown" without the owner doing anything.
      metadata: {
        ...auth.metadata,
        scopes: parseTiktokScopes(newTokens.scope),
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
