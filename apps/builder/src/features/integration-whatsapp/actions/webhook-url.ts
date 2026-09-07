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
 * Shared shape every `WhatsappAuthValue` this module builds is assembled
 * from — kept private so `buildAuthValue` (full, phone-number-specific,
 * persisted to the integration row) and `buildWabaAuthValue` (WABA-level
 * subset, used only for the WABA/business pre-work calls) can never drift on
 * the fields they share.
 */
function buildBaseAuthValue(params: {
  whatsappSettings: WhatsappCredential
  accessToken: string
  verifyToken: string
  redirectUrl: string
  metadata: WhatsappAuthValue["metadata"]
  clientId?: string
  clientSecret?: string
}): WhatsappAuthValue {
  const {
    whatsappSettings,
    accessToken,
    verifyToken,
    redirectUrl,
    metadata,
    clientId = whatsappSettings.clientId,
    clientSecret = whatsappSettings.clientSecret,
  } = params

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

/**
 * WABA-level subset of `buildAuthValue`, used only for the WABA/business
 * pre-work calls (`setupOAuthResources`, the plain `subscribeWebhook`) that
 * run before a specific phone number is known to be connectable — never
 * persisted. Session/OAuth paths only: manual connect never calls this (it
 * has no WABA-level pre-work of its own, see `subscribeManualWebhook`).
 *
 * `phoneNumber` is threaded through only because `WhatsappAuthValue["metadata"]`
 * requires one — `addSystemUser` / `shareCreditLine` / the plain
 * `subscribeWebhook` read only `metadata.wabaId` and the token, never
 * `metadata.phoneNumber`, so this is unused by the calls this auth value is
 * built for.
 */
export function buildWabaAuthValue(params: {
  whatsappSettings: WhatsappCredential
  accessToken: string
  wabaId: string
  businessId: string
  originUrl: string
  phoneNumber: WhatsappPhoneNumber
}): WhatsappAuthValue {
  const {
    whatsappSettings,
    accessToken,
    wabaId,
    businessId,
    originUrl,
    phoneNumber,
  } = params

  const { webhookUrl, verifyToken } = buildWebhookConfig({
    isManual: false,
    integrationId: "",
    originUrl,
    whatsappSettings,
  })
  const redirectUrl = new URL(
    "/integrations/whatsapp/callback",
    originUrl,
  ).toString()

  return buildBaseAuthValue({
    whatsappSettings,
    accessToken,
    verifyToken,
    redirectUrl,
    metadata: { wabaId, businessId, phoneNumber, webhookUrl },
  })
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

    clientSecret = ""

    const tokenData = await debugToken(accessToken)
    clientId = tokenData?.app_id ?? ""
  }

  return buildBaseAuthValue({
    whatsappSettings,
    accessToken,
    verifyToken,
    redirectUrl,
    metadata,
    clientId,
    clientSecret,
  })
}
