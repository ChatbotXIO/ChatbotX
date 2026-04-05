import {
  type BaseConfig,
  type HandleRequestProps,
  Integration,
  type IntegrationDefinition,
  type Oauth2AuthValue,
} from "@chatbotx.io/sdk"
import type { ChatbotxAuthValue } from "./auth"
import { broadcastMessageToWorkspaceParty } from "./lib/outgoing-message"

const config: IntegrationDefinition<BaseConfig, ChatbotxAuthValue> = {
  name: "chatbotx",
  channels: {
    channel: {
      message: {
        sendMessage: async ({ ctx, data }) => {
          await broadcastMessageToWorkspaceParty(ctx, data.message)
        },
      },
    },
  },
  actions: {},
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
