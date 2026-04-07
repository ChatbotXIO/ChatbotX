import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
} from "@aha.chat/sdk"
import { connect, registerWebhook } from "./apis/bot"
import { getUserProfile } from "./apis/user"
import { agentMarkAsRead, sendTyping } from "./conversation"
import { TelegramAPIException } from "./exception"
import { webhookHandler } from "./handlers/webhook"
import { receiveMessage } from "./incoming-message"
import { sendFlowStep, sendMessage } from "./outgoing-message"
import type {
  TelegramActions,
  TelegramAuthValue,
  TelegramConfig,
} from "./schemas"

const config: IntegrationDefinition<
  TelegramConfig,
  TelegramAuthValue,
  TelegramActions
> = {
  name: "telegram",
  channels: {
    channel: {
      message: {
        sendMessage,
        receiveMessage,
      },
      conversation: {
        sendTyping,
        agentMarkAsRead,
      },
    },
  },
  actions: {
    sendFlowStep,
    getUserProfile,
    connect: async ({ botToken }) => connect({ botToken }),
    registerWebhook: async ({ botToken, webhookUrl }) =>
      registerWebhook({ botToken, webhookUrl }),
  },
  handleRequest: async (props) => {
    const segments = new URL(props.req.url).pathname.split("/")
    const action = segments.pop()

    switch (action) {
      case HandleRequestType.webhook:
        return await webhookHandler(props)
      default:
        throw new TelegramAPIException(
          `${props.req.method} ${props.req.url} is not implemented`,
          props.req.url,
        )
    }
  },
  disconnect: (_props: TelegramAuthValue): Promise<void> => {
    throw new Error("Method is not implemented.")
  },
}

export const integration = new Integration<
  IntegrationDefinition<TelegramConfig, TelegramAuthValue, TelegramActions>
>(config)
