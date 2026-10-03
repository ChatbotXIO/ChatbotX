import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  probeVerify,
} from "@chatbotx.io/sdk"
import { connect, deleteWebhook, getMe, registerWebhook } from "./apis/bot"
import { TelegramAPIException } from "./exception"
import { contactHandlers } from "./handlers/contact"
import { conversationHandlers } from "./handlers/conversation"
import { messageHandlers } from "./handlers/message"
import { webhookHandler } from "./handlers/webhook"
import { isRevokedTokenError } from "./lib/error-mapper"
import type {
  TelegramActions,
  TelegramAuthValue,
  TelegramConfig,
} from "./schema"

const TELEGRAM_BOT_ID = /^\d+$/

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
  connection: {
    kind: "channel",
    strategy: "token",
    multiAccount: false,
    configFields: [
      {
        name: "secretText",
        type: "secret",
        required: true,
        labelKey: "integrations.telegram.fields.secretText",
      },
    ],
    describe: (auth) => {
      const separatorIndex = auth.secretText.indexOf(":")
      if (separatorIndex <= 0) {
        throw new Error("Telegram auth has no bot identity")
      }
      const botId = auth.secretText.slice(0, separatorIndex)
      if (!TELEGRAM_BOT_ID.test(botId)) {
        throw new Error("Telegram auth has no bot identity")
      }
      return {
        // The bot-token prefix is Telegram's stable bot identity.
        sourceId: botId,
        displayName: "Telegram bot",
      }
    },
    fromCredentials: async (config: { secretText: string }) => {
      // Live-validates the bot token via the same `getMe` call the legacy
      // `actions.connect` handler uses.
      await connect({ botToken: config.secretText })
      return { authType: "secretText", secretText: config.secretText }
    },
    verify: async ({ auth }) =>
      await probeVerify(() => getMe(auth), {
        label: "Telegram bot token",
        isRevoked: isRevokedTokenError,
      }),
    isRevokedTokenError,
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
