import {
  type BaseConfig,
  type HandleRequestProps,
  Integration,
  type IntegrationDefinition,
  type Oauth2AuthValue,
} from "@chatbotx.io/sdk"
import { conversationHandlers } from "./handlers/conversation"
import type { WebchatActions, WebchatAuthValue } from "./schema"

const config: IntegrationDefinition<
  BaseConfig,
  WebchatAuthValue,
  WebchatActions
> = {
  name: "webchat",
  channels: {
    channel: {
      conversation: conversationHandlers,
    },
  },
  actions: {},
  handleRequest(
    _props: HandleRequestProps<BaseConfig>,
  ): Promise<string | number | Oauth2AuthValue> {
    throw new Error("Method is not implemented.")
  },
  disconnect(_props: WebchatAuthValue): Promise<void> {
    throw new Error("Method is not implemented.")
  },
}

export const integration = new Integration(config)
