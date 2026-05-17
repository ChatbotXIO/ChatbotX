import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
} from "@chatbotx.io/sdk"
import { connect, deleteWebhook, registerWebhook } from "./apis/bot"
import { TelegramAPIException } from "./exception"
import { contactHandlers } from "./handlers/contact"
import { conversationHandlers } from "./handlers/conversation"
import { messageHandlers } from "./handlers/message"
import { webhookHandler } from "./handlers/webhook"
import type {
  TelegramActions,
  TelegramAuthValue,
  TelegramConfig,
} from "./schema"

const config: IntegrationDefinition<
  TelegramConfig,
  TelegramAuthValue,
  TelegramActions
> = {
  name: "telegram",
  channels: {
    channel: {
      message: messageHandlers,
      conversation: conversationHandlers,
      contact: contactHandlers,
    },
  },
  actions: {
    connect: async ({ botToken }) => {
      const botData = await connect({ botToken })

      return {
        id: botData.id.toString(),
        username: botData.username as string,
      }
    },
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
        )
    }
  },
  disconnect: async (auth: TelegramAuthValue): Promise<void> => {
    await deleteWebhook(auth.secretText)
  },
}

export const integration = new Integration<
  IntegrationDefinition<TelegramConfig, TelegramAuthValue, TelegramActions>
>(config)
