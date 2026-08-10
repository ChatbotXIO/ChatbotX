import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
} from "@chatbotx.io/sdk"
import {
  refreshLongLivedToken,
  unsubscribePageFromInstagramWebhook,
} from "./apis/page"
import { getPostDetails } from "./apis/post"
import { InstagramAPIException } from "./exception"
import { botHandlers } from "./handlers/bot"
import { commentHandlers } from "./handlers/comment"
import { contactHandlers } from "./handlers/contact"
import { conversationHandlers } from "./handlers/conversation"
import { messageHandlers } from "./handlers/message"
import { webhookHandler } from "./handlers/webhook"
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
