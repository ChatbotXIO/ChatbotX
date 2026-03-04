import {
  type BaseConfig,
  type HandleRequestProps,
  Integration,
  type IntegrationDefinition,
  type Oauth2AuthValue,
} from "@aha.chat/sdk"
import type { ChatbotxAuthValue } from "./auth"
import { broadcastMessageToChatbotParty } from "./lib/outgoing-message"

const config: IntegrationDefinition<BaseConfig, ChatbotxAuthValue> = {
  name: "chatbotx",
  channels: {
    channel: {
      message: {
        sendMessage: async ({ ctx, data }) => {
          await broadcastMessageToChatbotParty(ctx, data.message)
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
