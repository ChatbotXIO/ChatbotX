import {
  type EnsureAppWebhookFieldsResult,
  ensureAppWebhookFields,
  WHATSAPP_APP_SUBSCRIPTION_OBJECT,
  WHATSAPP_APP_WEBHOOK_FIELDS,
} from "@chatbotx.io/integration-whatsapp/api/app-subscriptions"

type EnsureWhatsappCallsWebhookSubscribedConfig = {
  appId: string
  appSecret: string
  verifyToken: string
}

/**
 * Ensures the app is subscribed to the WABA `calls` webhook field (and
 * best-effort `account_update`) — the app-level subscription the Calls-card
 * preflight checks for. Shared by the three call sites that need this after
 * saving app settings, reconnecting, and the preflight's manual "Fix"
 * button; each caller keeps its own error handling around the call.
 */
export const ensureWhatsappCallsWebhookSubscribed = (
  config: EnsureWhatsappCallsWebhookSubscribedConfig,
): Promise<EnsureAppWebhookFieldsResult> =>
  ensureAppWebhookFields({
    appId: config.appId,
    appSecret: config.appSecret,
    verifyToken: config.verifyToken,
    object: WHATSAPP_APP_SUBSCRIPTION_OBJECT.WHATSAPP_BUSINESS_ACCOUNT,
    requiredFields: [WHATSAPP_APP_WEBHOOK_FIELDS.CALLS],
    optionalFields: [WHATSAPP_APP_WEBHOOK_FIELDS.ACCOUNT_SETTINGS_UPDATE],
  })
