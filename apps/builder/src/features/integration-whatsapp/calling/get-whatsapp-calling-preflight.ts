import "server-only"
import {
  contactInboxService,
  platformCredentialService,
} from "@chatbotx.io/business"
import { sanitizePublicText } from "@chatbotx.io/business/errors"
import { channelTypes } from "@chatbotx.io/database/partials"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import {
  mapToChannelError,
  type WhatsappAuthValue,
} from "@chatbotx.io/integration-whatsapp"
import {
  getAppWebhookSubscriptions,
  WHATSAPP_APP_SUBSCRIPTION_OBJECT,
  WHATSAPP_APP_WEBHOOK_FIELDS,
} from "@chatbotx.io/integration-whatsapp/api/app-subscriptions"
import { getCallPermissions } from "@chatbotx.io/integration-whatsapp/api/calling"
import { findPhoneNumberDetail } from "@chatbotx.io/integration-whatsapp/api/phone-number"
import { UNKNOWN_ERROR } from "@chatbotx.io/sdk"
import { logger } from "@/lib/log"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { resolveDialIdentity } from "./actions/outbound-dial-target"

/**
 * Meta's Cloud API platform_type value that calling requires (i.e. not a
 * WhatsApp Business app coexistence number).
 */
const WHATSAPP_CALLING_PLATFORM_TYPE = "CLOUD_API"

/**
 * Asks Meta whether this number may call, by making the real
 * `GET /{pnid}/call_permissions` request the dial path makes. An
 * account-level refusal (e.g. 138013 - country restriction or account
 * eligibility) comes back whoever is named as the consumer, so any WhatsApp
 * contact on this inbox serves as the probe; the per-consumer answer itself is
 * discarded, only a failure is reported.
 *
 * Meta owns this rule, so its sentence is shown verbatim rather than inferred
 * from a table of ours that would go stale the moment Meta changes it.
 * Resolves to null when there is no contact to probe with, or when Meta
 * answered normally.
 */
async function probeCallingEligibility(props: {
  auth: WhatsappAuthValue
  inboxId: string
}): Promise<string | null> {
  const contactInbox = await contactInboxService
    .findBy({
      where: {
        inboxId: props.inboxId,
        channel: channelTypes.enum.whatsapp,
      },
    })
    .catch(() => undefined)
  if (!contactInbox) {
    return null
  }

  // The dial path's own addressing rule, reused rather than restated: it also
  // covers a Username/BSUID-only contact, which has no phone number to send.
  const { permissionTarget } = resolveDialIdentity(contactInbox)

  try {
    await getCallPermissions(props.auth, permissionTarget)
    return null
  } catch (error) {
    logger.warn(
      { err: error, inboxId: props.inboxId },
      "Whatsapp calling: Meta refused the calling-eligibility probe",
    )
    return describeForAgent(error)
  }
}

/**
 * Meta writes three strings for a refusal, and only two of them are meant for
 * a person: `error_user_title` and `error_user_msg`. `message` is the
 * developer-facing one - it names endpoints and payload shapes - so it is the
 * fallback, used only when Meta sent no human sentence at all.
 *
 * Reuses `mapToChannelError`, the existing parser for Graph error shapes,
 * rather than re-reading the body here.
 */
function describeForAgent(error: unknown): string | null {
  const channelError = mapToChannelError(error)
  const origin = channelError.getOriginError() as
    | { userTitle?: unknown; userMessage?: unknown }
    | undefined

  const humanParts = [origin?.userTitle, origin?.userMessage]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0)
  // Meta repeats itself across the two fields often enough that printing the
  // same sentence twice would be the common case.
  const sentence =
    [...new Set(humanParts)].join(": ") || channelError.message.trim()
  if (!sentence) {
    return null
  }

  // UNKNOWN_ERROR.code means the SDK could not read a code out of the body -
  // printing "(code -1)" at an agent would be noise, not a support handle.
  const code = channelError.code
  const hasUsefulCode =
    code !== UNKNOWN_ERROR.code && !sentence.includes(String(code))
  return (
    sanitizePublicText(
      hasUsefulCode ? `${sentence} (code ${code})` : sentence,
    ) || null
  )
}

export type WhatsappCallingPreflight = {
  /** Manually connected number: no app credential exists to check/fix. */
  isManual: boolean
  /**
   * Whether the owning workspace/tenant has a WhatsApp app credential to run
   * the app-level subscription check against.
   */
  hasAppCredential: boolean
  /** null = could not be determined (no credential, or the GET failed). */
  callsSubscribed: boolean | null
  platformType: string | null
  isCloudApiPlatform: boolean | null
  /**
   * From whatsapp_business_manager_messaging_limit (replaces the deprecated
   * messaging_limit_tier). Reported as-is: Meta owns the eligibility rule, and
   * a tier table of ours would go stale the moment Meta changes it.
   */
  messagingLimitTier: string | null
  /**
   * Meta's own explanation when the eligibility probe failed, already run
   * through the shared redactor. null when it succeeded or could not run.
   */
  callingIneligibleReason: string | null
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
 * Read-only eligibility check for the WhatsApp Calls card. Never writes
 * anything - fixWhatsappCallsSubscriptionAction is the only path that
 * subscribes the app to calls.
 */
export async function getWhatsappCallingPreflight(props: {
  workspace: WorkspaceModel
  auth: WhatsappAuthValue
  inboxId: string
  /**
   * Runs the live `call_permissions` probe. Off by default: this preflight
   * also runs on every conversation open, and that path never reads the
   * result - only the Calls settings card, opened deliberately, pays for the
   * extra Graph request.
   */
  probeEligibility?: boolean
}): Promise<WhatsappCallingPreflight> {
  const isManual = props.auth.metadata.isManual === true

  const [detail, callingIneligibleReason] = await Promise.all([
    findPhoneNumberDetail(props.auth).catch(() => null),
    props.probeEligibility
      ? probeCallingEligibility({ auth: props.auth, inboxId: props.inboxId })
      : null,
  ])
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
    callingIneligibleReason: callingIneligibleReason || null,
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
