import { buildContext, integrationWhatsappService } from "@chatbotx.io/business"
import type { ConnectWarning } from "@chatbotx.io/business/inbox/connect-outcome-types"
import type { WhatsappCredential } from "@chatbotx.io/database/partials"
import type { IntegrationWhatsappModel } from "@chatbotx.io/database/types"
import {
  integration as integrationWhatsapp,
  registerPhoneNumber,
  type WhatsappAuthValue,
} from "@chatbotx.io/integration-whatsapp"
import { appAccessToken } from "@chatbotx.io/integration-whatsapp/api/auth"
import {
  getCoexistEligibility,
  type WhatsappPhoneNumber,
} from "@chatbotx.io/integration-whatsapp/api/phone-number"
import { subscribeWebhook } from "@chatbotx.io/integration-whatsapp/api/webhook"
import { runConnectFollowUps } from "@/features/channel-connect/lib/connect-action-outcomes"
import { updateWorkspaceLogo } from "@/features/workspaces/actions/upload-logo"
import { logger } from "@/lib/log"
import { hasWhatsappCapiScope } from "../libs/capi-scope"
import { isCoexistOnboardingIntent } from "../libs/embedded-signup"
import { toRegistrationOutcome } from "../libs/registration-outcome"
import type { ConnectWhatsappSchema, WhatsappConnectExtra } from "../schema"

/**
 * Subscribes the manual-connect webhook override and records success on the
 * integration row. Runs inside `runConnectFollowUps` — a throw here (from
 * either the Meta call or the DB update) must reach that wrapper so the
 * connect still returns `connected` with a `followUpFailed` warning instead
 * of silently reporting a webhook that was never actually subscribed.
 */
async function subscribeManualWebhook(params: {
  auth: WhatsappAuthValue
  integrationId: string
  workspaceId: string
}): Promise<void> {
  const { auth, integrationId, workspaceId } = params
  await subscribeWebhook({ auth, overrideCallbackUrl: true })

  await integrationWhatsappService.updateAuth({
    id: integrationId,
    workspaceId,
    auth: {
      ...auth,
      metadata: { ...auth.metadata, subscribeOverrideOk: true },
    },
  })

  logger.info("subscribeWebhook")
}

/**
 * Resolves Meta-truth coexist eligibility: the form only carries user
 * intent, but Meta only places the phone in coexist mode when the app's
 * config_id is registered for the whatsapp_business_app_onboarding
 * solution AND the number is a WhatsApp Business App number. Calling
 * `/smb_app_data` on a non-eligible phone yields error 131000/10, so a
 * failed probe is swallowed and treated as "not coexist" rather than
 * failing the connect. Gated on the same helper the browser used to pick
 * `featureType`, so the two can never disagree.
 */
export async function resolveCoexistState(params: {
  parsedInput: ConnectWhatsappSchema
  phoneNumberId: string
  accessToken: string
  version: string
}): Promise<{ isCoexist: boolean; platformType: string }> {
  const { parsedInput, phoneNumberId, accessToken, version } = params

  if (!isCoexistOnboardingIntent(parsedInput)) {
    return { isCoexist: false, platformType: "" }
  }

  try {
    const eligibility = await getCoexistEligibility({
      phoneNumberId,
      accessToken,
      version,
    })

    return {
      isCoexist:
        eligibility.isOnBizApp && eligibility.platformType === "CLOUD_API",
      platformType: eligibility.platformType,
    }
  } catch (err) {
    logger.warn(
      { err, phoneNumberId },
      "[wa-connect] coexist eligibility check failed",
    )
    return { isCoexist: false, platformType: "" }
  }
}

type RegistrationOutcome = {
  requiresPhoneVerification: boolean
  registrationError: WhatsappConnectExtra["registrationError"]
}

/** Coexist numbers are Meta-registered already — `registerIfNeeded` returns this without calling Meta at all. */
const INITIAL_REGISTRATION: RegistrationOutcome = {
  requiresPhoneVerification: false,
  registrationError: null,
}

/** Refreshes the CAPI-scope cache so the newly connected number's ad-tracking capability reflects Meta's current grant immediately, instead of waiting out the cache's normal TTL. */
async function refreshIntegrationCache(params: {
  integrationRow: IntegrationWhatsappModel
  connectedWorkspaceId: string
  whatsappSettings: WhatsappCredential
}): Promise<void> {
  const { integrationRow, connectedWorkspaceId, whatsappSettings } = params
  await integrationWhatsappService.refreshCapiScopeCache({
    id: integrationRow.id,
    workspaceId: connectedWorkspaceId,
    maxAgeMs: 0,
    checkScope: (scopeInput) =>
      hasWhatsappCapiScope({
        ...scopeInput,
        appAccessToken: appAccessToken(whatsappSettings),
      }),
  })
}

/** Registers the number with Meta unless it's coexist-managed (Meta already owns registration for those), records the outcome, and reports whether OTP verification is still required. */
async function registerIfNeeded(params: {
  isCoexist: boolean
  auth: WhatsappAuthValue
  phoneNumber: WhatsappPhoneNumber
  integrationRow: IntegrationWhatsappModel
  connectedWorkspaceId: string
}): Promise<RegistrationOutcome> {
  const { isCoexist, auth, phoneNumber, integrationRow, connectedWorkspaceId } =
    params

  if (isCoexist) {
    return INITIAL_REGISTRATION
  }

  const registrationResult = await registerPhoneNumber({
    auth,
    phoneNumberId: phoneNumber.id,
  })
  const outcome = toRegistrationOutcome(registrationResult)
  const registrationError =
    await integrationWhatsappService.recordRegistrationOutcome({
      id: integrationRow.id,
      workspaceId: connectedWorkspaceId,
      outcome,
    })

  return {
    requiresPhoneVerification:
      registrationResult.status === "verification_required",
    registrationError,
  }
}

/** Refreshes the workspace's inbox logo from the connected number's WhatsApp business profile. */
async function applyBranding(params: {
  integrationRow: IntegrationWhatsappModel
  auth: WhatsappAuthValue
  connectedWorkspaceId: string
}): Promise<void> {
  const { integrationRow, auth, connectedWorkspaceId } = params
  const whatsappCtx = await buildContext({
    workspaceId: connectedWorkspaceId,
    integrationType: "whatsapp",
    integration: { ...integrationRow, auth },
  })
  await updateWorkspaceLogo({
    id: connectedWorkspaceId,
    integration: integrationWhatsapp,
    ctx: whatsappCtx,
  })
}

/**
 * Manual connect only: subscribes the plain webhook (shared callback URL),
 * then the manual override — restores the pre-rewrite sequence where
 * neither step is skipped and neither swallows a failure (see
 * `subscribeManualWebhook`).
 */
async function subscribeManualWebhookIfNeeded(params: {
  isManual: boolean
  auth: WhatsappAuthValue
  integrationId: string
  connectedWorkspaceId: string
}): Promise<void> {
  const { isManual, auth, integrationId, connectedWorkspaceId } = params
  if (!isManual) {
    return
  }

  await subscribeWebhook({ auth })
  await subscribeManualWebhook({
    auth,
    integrationId,
    workspaceId: connectedWorkspaceId,
  })
}

/**
 * Runs the best-effort follow-ups after the phone number is already
 * persisted (capi-scope refresh, registration status, branding/logo, and —
 * for manual connect only — the extra webhook subscribe). A throw anywhere
 * downgrades the whole batch to a `followUpFailed` warning instead of
 * failing the connect (`runConnectFollowUps`, shared across channels).
 * `registration` is written from inside that wrapped closure and returned
 * here — the caller only ever reads it when `warning` is falsy (see
 * `buildConnectedExtra`), so a throw partway through registration leaves it
 * at `INITIAL_REGISTRATION` harmlessly.
 */
export async function runWhatsappPostConnect(params: {
  isCoexist: boolean
  isManual: boolean
  auth: WhatsappAuthValue
  whatsappSettings: WhatsappCredential
  phoneNumber: WhatsappPhoneNumber
  integrationRow: IntegrationWhatsappModel
  connectedWorkspaceId: string
  integrationId: string
}): Promise<{
  warning: ConnectWarning | undefined
  requiresPhoneVerification: boolean
  registrationError: WhatsappConnectExtra["registrationError"]
}> {
  const {
    isCoexist,
    isManual,
    auth,
    whatsappSettings,
    phoneNumber,
    integrationRow,
    connectedWorkspaceId,
    integrationId,
  } = params

  let registration = INITIAL_REGISTRATION

  const warning = await runConnectFollowUps(
    async () => {
      await refreshIntegrationCache({
        integrationRow,
        connectedWorkspaceId,
        whatsappSettings,
      })

      registration = await registerIfNeeded({
        isCoexist,
        auth,
        phoneNumber,
        integrationRow,
        connectedWorkspaceId,
      })

      await applyBranding({ integrationRow, auth, connectedWorkspaceId })

      await subscribeManualWebhookIfNeeded({
        isManual,
        auth,
        integrationId,
        connectedWorkspaceId,
      })
    },
    {
      message:
        "WhatsApp connect follow-up failed after the phone number was connected",
      context: { integrationId: integrationRow.id },
    },
  )

  return {
    warning,
    requiresPhoneVerification: registration.requiresPhoneVerification,
    registrationError: registration.registrationError,
  }
}

/**
 * A follow-up failure means the operator sees only a `warning` — `extra`
 * (verification/manual onboarding info) is intentionally dropped rather
 * than reported half-computed; the number's own settings/useful-links page
 * is where they finish setup instead.
 */
export function buildConnectedExtra(params: {
  warning: ConnectWarning | undefined
  registration: {
    requiresPhoneVerification: boolean
    registrationError: WhatsappConnectExtra["registrationError"]
  }
  phoneNumber: WhatsappPhoneNumber
  manual: WhatsappConnectExtra["manual"]
}): WhatsappConnectExtra | null {
  if (params.warning) {
    return null
  }

  return {
    requiresPhoneVerification: params.registration.requiresPhoneVerification,
    registrationError: params.registration.registrationError,
    displayPhoneNumber: params.phoneNumber.display_phone_number,
    verifiedName: params.phoneNumber.verified_name,
    ...(params.manual ? { manual: params.manual } : {}),
  }
}
