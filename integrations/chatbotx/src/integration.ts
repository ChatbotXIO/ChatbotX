import {
  type BaseConfig,
  type HandleRequestProps,
  Integration,
  type IntegrationDefinition,
  type Oauth2AuthValue,
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
  connection: {
    kind: "channel",
    strategy: "self_serve",
    multiAccount: false,
    configFields: [],
    describe: () => ({
      // ChatbotX is a built-in workspace channel with no external account.
      sourceId: "workspace",
      displayName: "ChatbotX",
    }),
    // ChatbotX is internal, so there is no external provider to verify.
    verify: async () => ({ ok: true }),
    isRevokedTokenError: () => false,
  },
  handleRequest(
    _props: HandleRequestProps<BaseConfig>,
  ): Promise<string | number | Oauth2AuthValue> {
    throw new Error("Method is not implemented.")
  },
  disconnect(_props: ChatbotxAuthValue): Promise<void> {
    throw new Error("Method is not implemented.")
  },
}

export const integration = new Integration(config)
