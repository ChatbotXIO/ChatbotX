import { INBOUND_WEBHOOK_LIMITS } from "@chatbotx.io/database/partials"

type Translator = {
  (key: string, values?: Record<string, string | number>): string
  has: (key: string) => boolean
}

/**
 * Services raise validation failures as message keys (`validation.…`); the
 * action hands them to the client verbatim, so they are localised here.
 */
export const translateInboundWebhookError = (
  t: Translator,
  message: string | undefined,
  feature: string,
): string => {
  if (!message) {
    return t("messages.unknownError")
  }
  return message.startsWith("validation.") && t.has(message)
    ? t(message, {
        max: INBOUND_WEBHOOK_LIMITS.maxWebhooksPerWorkspace,
        feature,
      })
    : message
}
