import type { WhatsappCredential } from "@chatbotx.io/database/partials"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { debugToken } from "@chatbotx.io/integration-whatsapp/api/auth"
import type { WhatsappPhoneNumber } from "@chatbotx.io/integration-whatsapp/api/phone-number"
import { AuthType } from "@chatbotx.io/sdk"

/**
 * Build the WhatsApp webhook callback config.
 *
 * `originUrl` must be a host Meta can reach and trust: the reseller's own
 * custom domain for a tenant-owned credential (their own app), otherwise the
 * broker / canonical builder origin. On manual connect this URL is sent to
 * Meta as `override_callback_uri`. See `connect.action.ts` and
 * `lib/provider-origin.ts`.
 */
export function buildWebhookConfig(params: {
  isManual: boolean
  integrationId: string
  originUrl: string
  whatsappSettings: WhatsappCredential
}): { webhookUrl: string; verifyToken: string } {
  const { isManual, integrationId, originUrl, whatsappSettings } = params

  if (isManual) {
    return {
      verifyToken: crypto.randomUUID(),
      webhookUrl: new URL(
        `/integrations/whatsapp/webhook/${integrationId}`,
        originUrl,
      ).toString(),
    }
  }

  return {
    verifyToken: whatsappSettings.verifyToken,
    webhookUrl: new URL("/integrations/whatsapp/webhook", originUrl).toString(),
  }
}

/**
 * Build the persisted WhatsApp auth value. `originUrl` follows the same rule
 * as `buildWebhookConfig`: the stored `redirectUrl` lives on the tenant's
 * custom domain for a tenant-owned credential, otherwise the broker.
 */
export async function buildAuthValue(params: {
  whatsappSettings: WhatsappCredential
  accessToken: string
  verifyToken: string
  webhookUrl: string
  originUrl: string
  wabaId: string
  phoneNumber: WhatsappPhoneNumber
  businessId: string
  isManual: boolean
  /**
   * Manual connect only. When provided, the manual integration's inbound
   * webhook can be HMAC-verified like a platform-credential one; when
   * absent, `clientSecret` stays `""` and the webhook handler falls back to
   * its `legacy-unverified` policy (see
   * `integrations/whatsapp/src/handlers/webhook.ts`).
   */
  manualAppSecret?: string | null
}): Promise<WhatsappAuthValue> {
  const {
    whatsappSettings,
    accessToken,
    verifyToken,
    webhookUrl,
    originUrl,
    wabaId,
    phoneNumber,
    businessId,
    isManual,
    manualAppSecret,
  } = params

  let redirectUrl = webhookUrl

  if (!isManual) {
    redirectUrl = new URL(
      "/integrations/whatsapp/callback",
      originUrl,
    ).toString()
  }

  const metadata: WhatsappAuthValue["metadata"] = {
    wabaId,
    phoneNumber,
    businessId,
    webhookUrl,
  }

  // Don't mutate the caller's credential object (repo immutability rule). On
  // manual connect there is no reseller client secret, and the app id is derived
  // from the access token rather than the stored config.
  let clientId = whatsappSettings.clientId
  let clientSecret = whatsappSettings.clientSecret

  if (isManual) {
    metadata.isManual = true

    // The reseller's own app secret never applies here — the app tied to a
    // manual connection is derived below from the caller's access token, and
    // may not be our app at all. Use the owner-supplied Meta App Secret when
    // they gave one (enables real HMAC verification); otherwise stay "" and
    // the webhook handler's `legacy-unverified` policy keeps this
    // integration working exactly as before, just unverified.
    clientSecret = manualAppSecret?.trim() ?? ""

    const tokenData = await debugToken(accessToken)
    clientId = tokenData?.app_id ?? ""
  }

  return {
    clientId,
    clientSecret,
    verifyToken,
    redirectUrl,
    authType: AuthType.oauth2,
    tokens: { accessToken },
    metadata,
  }
}
