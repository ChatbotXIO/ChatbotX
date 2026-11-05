import {
  type EnsureAppWebhookFieldsResult,
  ensureAppWebhookFields,
  WHATSAPP_APP_SUBSCRIPTION_OBJECT,
  WHATSAPP_APP_WEBHOOK_FIELDS,
} from "@chatbotx.io/integration-whatsapp/api/app-subscriptions"

type EnsureWhatsappAppWebhookFieldsConfig = {
  appId: string
  appSecret: string
  verifyToken: string
}

/**
 * Ensures the app is subscribed to the WABA webhook fields we depend on:
 * `calls` (the app-level subscription the Calls-card preflight checks for) and
 * `account_update` (a number moving devices or being disconnected), plus
 * best-effort `account_settings_update`. Shared by the call sites that need
 * this after saving app settings and by the preflight's manual "Fix" button;
 * each caller keeps its own error handling around the call.
 */
export const ensureWhatsappAppWebhookFields = (
  config: EnsureWhatsappAppWebhookFieldsConfig,
): Promise<EnsureAppWebhookFieldsResult> =>
  ensureAppWebhookFields({
    appId: config.appId,
    appSecret: config.appSecret,
    verifyToken: config.verifyToken,
    object: WHATSAPP_APP_SUBSCRIPTION_OBJECT.WHATSAPP_BUSINESS_ACCOUNT,
    requiredFields: [
      WHATSAPP_APP_WEBHOOK_FIELDS.CALLS,
      WHATSAPP_APP_WEBHOOK_FIELDS.ACCOUNT_UPDATE,
    ],
    optionalFields: [WHATSAPP_APP_WEBHOOK_FIELDS.ACCOUNT_SETTINGS_UPDATE],
  })
