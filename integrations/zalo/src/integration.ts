import {
  AuthException,
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@chatbotx.io/sdk"
import { refreshAccessToken } from "./api/auth"
import {
  getUserDetail,
  listOaTags,
  removeFollowerFromTag,
  removeTag,
  tagFollower,
} from "./api/tag"
import { callbackHandler } from "./handlers/callback"
import { contactHandlers } from "./handlers/handler"
import { messageHandlers } from "./handlers/message"
import { webhookHandler } from "./handlers/webhook"
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
