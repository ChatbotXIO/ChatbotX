import {
  type BaseConfig,
  type HandleRequestProps,
  Integration,
  type IntegrationDefinition,
  type Oauth2AuthValue,
} from "@chatbotx.io/sdk"
import { conversationHandlers } from "./handlers/conversation"
import { messageHandlers } from "./handlers/message"
import type { ApiActions, ApiAuthValue } from "./schema"

const config: IntegrationDefinition<BaseConfig, ApiAuthValue, ApiActions> = {
  name: "api",
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
    // No vendor webhook — inbound arrives via the builder's own REST API,
    // not a provider-initiated webhook, so there is nothing to route here.
    throw new Error("Method is not implemented.")
  },
  disconnect(_props: ApiAuthValue): Promise<void> {
    // No external provider to disconnect; removing the inbox row is the
    // whole teardown, mirroring webchat/integration.ts.
    return Promise.resolve()
  },
}

export const integration = new Integration(config)
