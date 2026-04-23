import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  SdkException,
  TokenExpiredException,
} from "@chatbotx.io/sdk"
import { refreshAccessToken } from "./api/auth"
import { callbackHandler } from "./handlers/callback"
import { contactHandlers } from "./handlers/handler"
import { messageHandlers } from "./handlers/message"
import { webhookHandler } from "./handlers/webhook"
import type { ZaloAuthValue, ZaloConfig } from "./schema/definition"

const config: IntegrationDefinition<ZaloConfig, ZaloAuthValue> = {
  name: "zalo",
  channels: {
    channel: {
      message: messageHandlers,
      contact: contactHandlers,
    },
  },
  actions: {},
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
  disconnect: (_props: ZaloAuthValue): Promise<void> => {
    throw new Error("Method is not implemented.")
  },
  refreshToken: async (auth: ZaloAuthValue): Promise<ZaloAuthValue> => {
    if (!auth.tokens.refreshToken) {
      throw new TokenExpiredException("No refresh token available for Zalo")
    }

    const result = await refreshAccessToken(
      {
        clientId: auth.clientId,
        clientSecret: auth.clientSecret,
        redirectUrl: auth.redirectUrl,
      },
      auth.tokens.refreshToken,
    )

    return {
      ...auth,
      tokens: {
        ...auth.tokens,
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        expiresAt: new Date(
          Date.now() + result.expires_in * 1000,
        ).toISOString(),
      },
    }
  },
}

export const integration = new Integration<
  IntegrationDefinition<ZaloConfig, ZaloAuthValue>
>(config)
