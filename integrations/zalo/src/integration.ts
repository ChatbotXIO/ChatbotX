import {
  AuthException,
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  oauth2Auth,
  probeVerify,
  SdkException,
} from "@chatbotx.io/sdk"
import {
  convertCodeToTokens,
  getZaloOAProfile,
  refreshAccessToken,
} from "./api/auth"
import {
  getUserDetail,
  listOaTags,
  removeFollowerFromTag,
  removeTag,
  tagFollower,
} from "./api/tag"
import { ZALO_API_ENDPOINTS, ZALO_OAUTH_BASE_URL } from "./constants"
import { callbackHandler } from "./handlers/callback"
import { contactHandlers } from "./handlers/handler"
import { messageHandlers } from "./handlers/message"
import { webhookHandler } from "./handlers/webhook"
import { isRevokedTokenError } from "./lib/error-mapper"
import type {
  ZaloActions,
  ZaloAuthValue,
  ZaloConfig,
} from "./schema/definition"
import { calculateExpiresAt } from "./utils"

const config: IntegrationDefinition<ZaloConfig, ZaloAuthValue, ZaloActions> = {
  name: "zalo",
  channels: {
    channel: {
      message: messageHandlers,
      contact: contactHandlers,
    },
  },
  actions: {
    tagFollower,
    removeFollowerFromTag,
    listOaTags,
    removeTag,
    getUserDetail,
  },
  connection: {
    kind: "channel",
    strategy: "oauth_redirect",
    multiAccount: false,
    configFields: [],
    authorizeUrl: ({ credential, callbackUrl, state }) => {
      const config = credential as ZaloConfig
      const params = new URLSearchParams({
        app_id: config.clientId,
        redirect_uri: callbackUrl,
        state,
      })
      return `${ZALO_OAUTH_BASE_URL}${ZALO_API_ENDPOINTS.AUTH.PERMISSION}?${params.toString()}`
    },
    exchangeCode: async ({ code, callbackUrl, credential }) => {
      const config = credential as ZaloConfig
      const tokens = await convertCodeToTokens(
        { ...config, redirectUrl: callbackUrl },
        code,
      )
      const oaProfile = await getZaloOAProfile(tokens.access_token)
      return {
        ...oauth2Auth(
          config,
          callbackUrl,
          {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: calculateExpiresAt(tokens.expires_in),
          },
          {
            version: config.version,
            oaName: oaProfile.name,
          },
        ),
        oaId: oaProfile.oa_id,
      } satisfies ZaloAuthValue
    },
    describe: (auth) => ({
      sourceId: auth.oaId,
      displayName: auth.metadata.oaName || "Zalo",
    }),
    verify: async ({ auth }) =>
      await probeVerify(() => getZaloOAProfile(auth.tokens.accessToken), {
        label: "Zalo connection",
        expiresAt: auth.tokens.expiresAt,
        isRevoked: isRevokedTokenError,
      }),
    isRevokedTokenError,
  },
  handleRequest: async (props) => {
    const segments = new URL(props.req.url).pathname.split("/")
    const method = segments.pop()

    switch (method) {
      case HandleRequestType.webhook:
        return await webhookHandler(props)
      case HandleRequestType.callback:
        return await callbackHandler(props)
      default:
        throw new SdkException(
          `Handler: ${props.req.method} ${props.req.url} is not implemented`,
        )
    }
  },
  disconnect: async (_auth: ZaloAuthValue): Promise<void> => {
    // Zalo OA webhooks are configured per-app in the Zalo Developer Console —
    // there is no per-connection API to unsubscribe, so nothing to call here.
    // Per-workspace teardown removes the local Zalo integration row, after
    // which inbound events for that OA no longer resolve to a workspace.
  },
  refreshAuth: async ({ auth }) => {
    if (!auth.tokens.refreshToken) {
      throw new AuthException("Zalo refresh token not available")
    }
    const newTokens = await refreshAccessToken(auth, auth.tokens.refreshToken)
    return {
      ...auth,
      tokens: {
        ...auth.tokens,
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token,
        expiresAt: calculateExpiresAt(newTokens.expires_in),
      },
    }
  },
}

export const integration = new Integration<
  IntegrationDefinition<ZaloConfig, ZaloAuthValue, ZaloActions>
>(config)
