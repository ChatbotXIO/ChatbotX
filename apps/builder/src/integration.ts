import { CONNECTION_REGISTRY } from "@chatbotx.io/connections"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import type { integration as integrationActiveCampaign } from "@chatbotx.io/integration-active-campaign"
import type { integration as integrationApi } from "@chatbotx.io/integration-api"
import type { integration as integrationChatbotx } from "@chatbotx.io/integration-chatbotx"
import type { integration as integrationDrip } from "@chatbotx.io/integration-drip"
import type { integration as integrationFacebookAds } from "@chatbotx.io/integration-facebook-ads"
import type { integration as integrationGetResponse } from "@chatbotx.io/integration-get-response"
import type { integration as integrationGoogleCalendar } from "@chatbotx.io/integration-google-calendar"
import type { integration as integrationGoogleSheets } from "@chatbotx.io/integration-google-sheets"
import type { integration as integrationInstagram } from "@chatbotx.io/integration-instagram"
import type { integration as integrationInstagramFacebook } from "@chatbotx.io/integration-instagram-facebook"
import type { integration as integrationKlaviyo } from "@chatbotx.io/integration-klaviyo"
import type { integration as integrationMailchimp } from "@chatbotx.io/integration-mailchimp"
import type { integration as integrationMailerLite } from "@chatbotx.io/integration-mailer-lite"
import type { integration as integrationMessenger } from "@chatbotx.io/integration-messenger"
import type { integration as integrationMoosend } from "@chatbotx.io/integration-moosend"
import type { integration as integrationSendGrid } from "@chatbotx.io/integration-sendgrid"
import type { integration as integrationSmtp } from "@chatbotx.io/integration-smtp"
import type { integration as integrationTelegram } from "@chatbotx.io/integration-telegram"
import type { integration as integrationTiktok } from "@chatbotx.io/integration-tiktok"
import type { integration as integrationWebchat } from "@chatbotx.io/integration-webchat"
import type { integration as integrationWhatsapp } from "@chatbotx.io/integration-whatsapp"
import type { integration as integrationZalo } from "@chatbotx.io/integration-zalo"

/**
 * `CONNECTION_REGISTRY`'s own module-load assertions
 * (`packages/connections/src/registry.ts`'s `fromIntegration`) already throw
 * if one of these specific providers loses its `connection` block, so a
 * missing `.integration` here can only mean a genuine registry bug.
 *
 * `ConnectionAdapter.integration` is declared as
 * `Integration<IntegrationDefinition<any, any, any>>` (the heterogeneous-
 * registry tradeoff documented on that field) — every entry `integrations`
 * below reads is registered from the exact same singleton this file used to
 * import directly, so casting back to `T` restores each provider's precise
 * static type (`runAction<K>` action-name checking, `channels.*` handler
 * shapes) rather than letting every caller silently degrade to `any`.
 */
const requireIntegration = <T>(type: IntegrationType): T => {
  const integration = CONNECTION_REGISTRY[type]?.integration
  if (!integration) {
    throw new Error(
      `@/integration: CONNECTION_REGISTRY.${type} has no .integration — the connections registry is out of sync with this file.`,
    )
  }
  return integration as T
}

/**
 * Derives the same 22-key registry `IntegrationKey` consumers have always
 * used, but now sourced from `CONNECTION_REGISTRY` — the single exhaustive
 * provider registry `@chatbotx.io/connections` builds from each
 * `integrations/<name>` package's `Integration` instance.
 */
export const integrations = {
  api: requireIntegration<typeof integrationApi>("api"),
  whatsapp: requireIntegration<typeof integrationWhatsapp>("whatsapp"),
  messenger: requireIntegration<typeof integrationMessenger>("messenger"),
  instagram: requireIntegration<typeof integrationInstagram>("instagram"),
  instagramFacebook:
    requireIntegration<typeof integrationInstagramFacebook>(
      "instagramFacebook",
    ),
  activeCampaign:
    requireIntegration<typeof integrationActiveCampaign>("activeCampaign"),
  drip: requireIntegration<typeof integrationDrip>("drip"),
  getResponse: requireIntegration<typeof integrationGetResponse>("getResponse"),
  klaviyo: requireIntegration<typeof integrationKlaviyo>("klaviyo"),
  mailchimp: requireIntegration<typeof integrationMailchimp>("mailchimp"),
  mailerLite: requireIntegration<typeof integrationMailerLite>("mailerLite"),
  moosend: requireIntegration<typeof integrationMoosend>("moosend"),
  googleCalendar:
    requireIntegration<typeof integrationGoogleCalendar>("googleCalendar"),
  googleSheets:
    requireIntegration<typeof integrationGoogleSheets>("googleSheets"),
  facebookAds: requireIntegration<typeof integrationFacebookAds>("facebookAds"),
  zalo: requireIntegration<typeof integrationZalo>("zalo"),
  telegram: requireIntegration<typeof integrationTelegram>("telegram"),
  tiktok: requireIntegration<typeof integrationTiktok>("tiktok"),
  webchat: requireIntegration<typeof integrationWebchat>("webchat"),
  chatbotx: requireIntegration<typeof integrationChatbotx>("chatbotx"),
  smtp: requireIntegration<typeof integrationSmtp>("smtp"),
  sendGrid: requireIntegration<typeof integrationSendGrid>("sendGrid"),
}

export type IntegrationKey = keyof typeof integrations
