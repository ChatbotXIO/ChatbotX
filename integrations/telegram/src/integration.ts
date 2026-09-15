import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
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
    multiAccount: true,
    configFields: [
      {
        name: "secretText",
        type: "secret",
        required: true,
        labelKey: "integrations.telegram.fields.secretText",
      },
    ],
    describe: (auth) => ({
      // Telegram bot tokens are formatted `<botId>:<secret>` — the numeric
      // prefix is Telegram's own stable bot identity: it matches what the
      // Phase 1 backfill wrote into `IntegrationTelegram.botId` (this
      // provider's `identityColumn`) and what `ConnectionStoreBinding
      // .insertRow` writes back into that same NOT NULL unique column from
      // this exact `sourceId`. A constant like `"workspace"` would collide
      // across every bot in the workspace and corrupt `botId`.
      sourceId: auth.secretText.split(":")[0] || auth.secretText,
      displayName: "Telegram bot",
    }),
    fromCredentials: async (config: { secretText: string }) => {
      // Live-validates the bot token via the same `getMe` call the legacy
      // `actions.connect` handler uses.
      await connect({ botToken: config.secretText })
      return { authType: "secretText", secretText: config.secretText }
    },
    verify: async ({ auth }) => {
      try {
        await getMe(auth)
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          revoked: isRevokedTokenError(error),
          error:
            error instanceof Error
              ? error.message
              : "Telegram bot token verification failed",
        }
      }
    },
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
