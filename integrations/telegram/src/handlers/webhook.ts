import type { HandleRequestProps } from "@chatbotx.io/sdk"
import { TelegramWebhookException } from "../exception"
import type { TelegramConfig } from "../schema"
import { telegramUpdateSchema } from "../schema"

export const webhookHandler = async (
  props: HandleRequestProps<TelegramConfig>,
): Promise<string> => {
  const { req, config, queue } = props

  // const secretToken = req.headers.get("x-telegram-bot-api-secret-token")
  // if (config.webhookSecretToken && secretToken !== config.webhookSecretToken) {
  //   throw new TelegramWebhookException("Invalid webhook secret token")
  // }

  const body = await req.text()
  if (!body) {
    throw new TelegramWebhookException("Empty webhook payload")
  }

  const update = telegramUpdateSchema.parse(JSON.parse(body))

  const integrationIdentifier = config.botId ?? ""

  if (update.callback_query) {
    const chatId = update.callback_query.message?.chat.id
    if (!chatId) {
      return "ok"
    }

    await queue?.add("incomingMessage", {
      type: "incomingMessage",
      data: {
        integrationType: "telegram",
        integrationIdentifier,
        payload: update,
      },
    })
    return "ok"
  }

  if (!update.message) {
    return "ok"
  }

  await queue?.add("incomingMessage", {
    type: "incomingMessage",
    data: {
      integrationType: "telegram",
      integrationIdentifier,
      payload: update,
    },
  })

  return "ok"
}
