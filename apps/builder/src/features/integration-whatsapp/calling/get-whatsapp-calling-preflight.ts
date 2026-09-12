import "server-only"
import { platformCredentialService } from "@chatbotx.io/business"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import {
  getAppWebhookSubscriptions,
  WHATSAPP_APP_SUBSCRIPTION_OBJECT,
  WHATSAPP_APP_WEBHOOK_FIELDS,
} from "@chatbotx.io/integration-whatsapp/api/app-subscriptions"
import { findPhoneNumberDetail } from "@chatbotx.io/integration-whatsapp/api/phone-number"
import { logger } from "@/lib/log"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"

/**
 * Meta's calling-eligibility error 138015 says "make sure messaging limit on
 * your phone number is 2000 or more". The documented messaging-limit tiers
 * (phone-number reference) are, in order: 250 → 2,000 → 10,000 → 100,000 →
 * Unlimited, i.e. `TIER_250`, `TIER_2K`, `TIER_10K`, `TIER_100K`,
 * `TIER_UNLIMITED` — with `TIER_50` and `TIER_1K` as older/lower tiers below
 * the 2,000 threshold. Anything at or below 1,000/24h fails the "2000 or
 * more" requirement.
 */
const INSUFFICIENT_MESSAGING_LIMITS = [
  "TIER_50",
  "TIER_250",
  "TIER_1K",
] as const

/** The documented tiers at/above the "2000 or more" requirement (error
 * 138015) — used only to tell "unrecognized" apart from "known sufficient"
 * for the warn-log below, never to gate the eligibility result itself. */
const KNOWN_SUFFICIENT_MESSAGING_LIMITS = [
  "TIER_2K",
  "TIER_10K",
  "TIER_100K",
  "TIER_UNLIMITED",
] as const

/** Meta's Cloud API `platform_type` value that calling requires (i.e. not a
 * WhatsApp Business app coexistence number). */
const WHATSAPP_CALLING_PLATFORM_TYPE = "CLOUD_API"

/**
 * `messaging_limit_tier` is deprecated — this reads
 * `whatsapp_business_manager_messaging_limit` (reference:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/phone-numbers,
 * example value `"TIER_250"`). A missing or unrecognized value (e.g. a newer
 * tier Meta adds later) counts as sufficient — never block calling on a
 * value we don't recognize — but is logged so it can be added here.
 */
function isMessagingLimitSufficient(limit: string | null): boolean {
  if (!limit) {
    return true
  }

  const sufficient = !INSUFFICIENT_MESSAGING_LIMITS.includes(
    limit as (typeof INSUFFICIENT_MESSAGING_LIMITS)[number],
  )

  if (
    sufficient &&
    !KNOWN_SUFFICIENT_MESSAGING_LIMITS.includes(
      limit as (typeof KNOWN_SUFFICIENT_MESSAGING_LIMITS)[number],
    )
  ) {
    logger.warn(
      { limit },
      "Unrecognized whatsapp_business_manager_messaging_limit value — treating as sufficient",
    )
  }

  return sufficient
}

export type WhatsappCallingPreflight = {
  /** Manually connected number: no app credential exists to check/fix. */
  isManual: boolean
  /** Whether the owning workspace/tenant has a WhatsApp app credential to
   * run the app-level subscription check against. */
  hasAppCredential: boolean
  /** null = could not be determined (no credential, or the GET failed). */
  callsSubscribed: boolean | null
  platformType: string | null
  isCloudApiPlatform: boolean | null
  /** From `whatsapp_business_manager_messaging_limit` (the field that
   * replaces the deprecated `messaging_limit_tier`). */
  messagingLimitTier: string | null
  messagingLimitSufficient: boolean
}

async function resolveCallsSubscribed(props: {
  clientId: string
  clientSecret: string
}): Promise<boolean | null> {
  const subscriptions = await getAppWebhookSubscriptions({
    appId: props.clientId,
    appSecret: props.clientSecret,
  }).catch(() => null)

  if (subscriptions === null) {
    return null
  }

  const wabaSubscription = subscriptions.find(
    (subscription) =>
      subscription.object ===
      WHATSAPP_APP_SUBSCRIPTION_OBJECT.WHATSAPP_BUSINESS_ACCOUNT,
  )
  if (!wabaSubscription) {
    return false
  }

  return wabaSubscription.fields.some(
    (field) => field.name === WHATSAPP_APP_WEBHOOK_FIELDS.CALLS,
  )
}

/**
 * Read-only eligibility check for the WhatsApp Calls card.
 * Never writes anything — the "Fix" action (`fixWhatsappCallsSubscriptionAction`)
 * is the only path that subscribes the app to `calls`.
 */
export async function getWhatsappCallingPreflight(props: {
  workspace: WorkspaceModel
  auth: WhatsappAuthValue
}): Promise<WhatsappCallingPreflight> {
  const isManual = props.auth.metadata.isManual === true

  const detail = await findPhoneNumberDetail(props.auth).catch(() => null)
  const platformType = detail?.platform_type ?? null
  const messagingLimitTier =
    detail?.whatsapp_business_manager_messaging_limit ?? null
  const shared = {
    platformType,
    isCloudApiPlatform:
      platformType === null
        ? null
        : platformType === WHATSAPP_CALLING_PLATFORM_TYPE,
    messagingLimitTier,
    messagingLimitSufficient: isMessagingLimitSufficient(messagingLimitTier),
  }

  if (isManual) {
    return {
      isManual: true,
      hasAppCredential: false,
      callsSubscribed: null,
      ...shared,
    }
  }

  const ownerId = await resolveOwnerForWorkspace(props.workspace)
  const credential = await platformCredentialService
    .resolveForOwner({ ownerId, type: "whatsapp" })
    .catch(() => undefined)

  if (!credential) {
    return {
      isManual: false,
      hasAppCredential: false,
      callsSubscribed: null,
      ...shared,
    }
  }

  const callsSubscribed = await resolveCallsSubscribed({
    clientId: credential.config.clientId,
    clientSecret: credential.config.clientSecret,
  })

  return {
    isManual: false,
    hasAppCredential: true,
    callsSubscribed,
    ...shared,
  }
}
