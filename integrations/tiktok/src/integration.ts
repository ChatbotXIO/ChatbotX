import {
  AuthException,
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
} from "@chatbotx.io/sdk"
import { refreshAccessToken } from "./apis/auth"
import { TiktokAPIException } from "./exception"
import { callbackHandler } from "./handlers/callback"
import { commentHandlers } from "./handlers/comment"
import { contactHandlers } from "./handlers/contact"
import { conversationHandlers } from "./handlers/conversation"
import { messageHandlers } from "./handlers/message"
import { webhookHandler } from "./handlers/webhook"
import { buildTokenTimestamps } from "./lib/token-utils"
import type { TiktokActions, TiktokAuthValue, TiktokConfig } from "./schema"

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
