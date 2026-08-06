import {
  type BaseConfig,
  type HandleRequestProps,
  Integration,
  type IntegrationDefinition,
  type Oauth2AuthValue,
} from "@chatbotx.io/sdk"
import { conversationHandlers } from "./handlers/conversation"
import { messageHandlers } from "./handlers/message"
import type { WebchatActions, WebchatAuthValue } from "./schema"

const config: IntegrationDefinition<
  BaseConfig,
  WebchatAuthValue,
  WebchatActions
> = {
  name: "webchat",
  channels: {
    channel: {
      message: messageHandlers,
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
    // Webchat is a built-in channel with no external provider to disconnect;
    // removing the inbox row is the whole teardown, so this is a no-op.
    return Promise.resolve()
  },
}

export const integration = new Integration(config)
