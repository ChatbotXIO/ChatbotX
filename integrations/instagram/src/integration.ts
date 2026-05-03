import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
} from "@chatbotx.io/sdk"
import { InstagramAPIException } from "./exception"
import { botHandlers } from "./handlers/bot"
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
      conversation: conversationHandlers,
      contact: contactHandlers,
      bot: botHandlers,
    },
  },
  actions: {},
  handleRequest: async (props) => {
    const segments = new URL(props.req.url).pathname.split("/")
    const action = segments.pop()

    switch (action) {
      case HandleRequestType.webhook:
        return await webhookHandler(props)
      default:
        throw new InstagramAPIException(
          `${props.req.method} ${props.req.url} is not implemented`,
          props.req.url,
        )
    }
  },
  disconnect: (_props: InstagramAuthValue): Promise<void> => {
    throw new Error("Method is not implemented.")
  },
}

export const integration = new Integration<
  IntegrationDefinition<InstagramConfig, InstagramAuthValue, InstagramActions>
>(config)
