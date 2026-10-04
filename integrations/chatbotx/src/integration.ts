import {
  type BaseConfig,
  type HandleRequestProps,
  Integration,
  type IntegrationDefinition,
  type Oauth2AuthValue,
  selfServeConnection,
} from "@chatbotx.io/sdk"
import type { ChatbotxAuthValue } from "./auth"

const config: IntegrationDefinition<BaseConfig, ChatbotxAuthValue> = {
  name: "chatbotx",
  channels: {
    channel: {
      message: {},
    },
  },
  actions: {},
  connection: selfServeConnection<ChatbotxAuthValue>({
    displayName: "ChatbotX",
    multiAccount: false,
  }),
  handleRequest(
    _props: HandleRequestProps<BaseConfig>,
  ): Promise<string | number | Oauth2AuthValue> {
    throw new Error("Method is not implemented.")
  },
  disconnect(_props: ChatbotxAuthValue): Promise<void> {
    // ChatbotX is a built-in workspace channel with no external provider
    // to disconnect; removing the inbox row is the whole teardown.
    return Promise.resolve()
  },
}

export const integration = new Integration(config)
