import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"

/**
 * WhatsApp embedded-signup helpers.
 *
 * Instead of running the Facebook JS SDK (whose OAuth origin is bound to
 * `window.location`, so it breaks on a white-label reseller custom domain), we
 * open the Facebook OAuth dialog directly with `redirect_uri` set to the fixed,
 * Meta-registered broker callback. Facebook returns the `code` to that broker
 * route, which relays it back to the originating reseller tab via
 * `window.opener.postMessage`. The reseller — where the session cookie lives —
 * exchanges the code and derives the WABA/phone/business ids server-side.
 */

export const EMBEDDED_SIGNUP_FEATURE_TYPES = {
  WHATSAPP_BUSINESS_APP_ONBOARDING: "whatsapp_business_app_onboarding",
  ONLY_WABA_SHARING: "only_waba_sharing",
} as const

const EMBEDDED_SIGNUP_FEATURES = {
  MARKETING_MESSAGES_LITE: "marketing_messages_lite",
} as const

const FACEBOOK_DIALOG_BASE = "https://www.facebook.com"

/** Broker route Facebook redirects the `code` to (the only registered URI). */
export const WHATSAPP_OAUTH_CALLBACK_PATH = "/integrations/whatsapp/callback"

/**
 * `window.postMessage` contract between the broker callback route and the
 * reseller tab. The reseller validates `event.origin === getBrokerOrigin()`
 * before trusting it, and the broker validates the reseller origin (from `state`)
 * before posting — so a signup `code` is never relayed to an origin we do not
 * control.
 */
export const WA_OAUTH_RESULT = "WA_OAUTH_RESULT" as const

export type WhatsappOAuthRelayResult = {
  type: typeof WA_OAUTH_RESULT
  status: "success" | "error"
  code?: string
}

/** State round-tripped through Facebook so the broker knows where to relay back. */
export type WhatsappOAuthState = {
  referer: string
  locale?: string
}

export function encodeOAuthState(state: WhatsappOAuthState): string {
  return btoa(JSON.stringify(state))
}

export function decodeOAuthState(raw: string): WhatsappOAuthState | null {
  try {
    const parsed = JSON.parse(atob(raw)) as Partial<WhatsappOAuthState>
    if (typeof parsed.referer !== "string") {
      return null
    }
    return {
      referer: parsed.referer,
      locale: typeof parsed.locale === "string" ? parsed.locale : undefined,
    }
  } catch {
    return null
  }
}

export type EmbeddedSignupIntent = {
  connectExisting: boolean
  transferPhoneNumber: boolean
  /** Manual connect bypasses embedded signup entirely. */
  manualConnect?: boolean
}

/**
 * Derive Meta's embedded-signup `featureType` from the user's intent.
 *
 * - Transferring a number hosted by another provider means the WABA already
 *   exists elsewhere, so Meta must open the existing-WABA sharing screen.
 * - Connecting an existing account means the number is live on the WhatsApp
 *   Business App, which is Meta's coexistence onboarding screen.
 *
 * When both are set the transfer wins — sharing a foreign WABA cannot also be a
 * coexist onboarding.
 */
export function resolveEmbeddedSignupFeatureType(
  params: EmbeddedSignupIntent,
): string | undefined {
  if (params.transferPhoneNumber) {
    return EMBEDDED_SIGNUP_FEATURE_TYPES.ONLY_WABA_SHARING
  }
  if (params.connectExisting) {
    return EMBEDDED_SIGNUP_FEATURE_TYPES.WHATSAPP_BUSINESS_APP_ONBOARDING
  }
  return
}

/**
 * Whether this intent asked Meta for the coexistence flow. The server keys its
 * coexist eligibility check on this, so it stays in lockstep with the
 * `featureType` the browser actually sent to Meta. A manual connect never opens
 * the dialog, so it is never a coexist onboarding — even though the form leaves
 * `connectExisting` on behind it.
 */
export function isCoexistOnboardingIntent(
  params: EmbeddedSignupIntent,
): boolean {
  if (params.manualConnect) {
    return false
  }
  return (
    resolveEmbeddedSignupFeatureType(params) ===
    EMBEDDED_SIGNUP_FEATURE_TYPES.WHATSAPP_BUSINESS_APP_ONBOARDING
  )
}

/** The exact embedded-signup `extras` object Meta expects. */
function buildEmbeddedSignupExtras(featureType?: string) {
  return {
    sessionInfoVersion: 3,
    setup: {},
    features: [EMBEDDED_SIGNUP_FEATURES.MARKETING_MESSAGES_LITE],
    ...(featureType ? { featureType } : {}),
  }
}

export type FacebookOAuthDialogParams = {
  /** The reseller origin the broker relays the result back to. */
  resellerOrigin: string
  clientId: string
  configId: string
  version: string
  connectExisting: boolean
  transferPhoneNumber: boolean
  locale?: string
}

/**
 * Build the absolute Facebook OAuth dialog URL to open in a popup. `redirect_uri`
 * is the broker callback (the only origin registered with Meta); `state` carries
 * the reseller origin so the broker can relay the `code` back to the right tab.
 */
export function buildFacebookOAuthDialogUrl(
  params: FacebookOAuthDialogParams,
): string {
  const url = new URL(`${FACEBOOK_DIALOG_BASE}/${params.version}/dialog/oauth`)
  url.searchParams.set("client_id", params.clientId)
  url.searchParams.set("config_id", params.configId)
  url.searchParams.set(
    "redirect_uri",
    buildBrokerCallbackUrl(WHATSAPP_OAUTH_CALLBACK_PATH),
  )
  url.searchParams.set("response_type", "code")
  url.searchParams.set(
    "state",
    encodeOAuthState({
      referer: params.resellerOrigin,
      locale: params.locale,
    }),
  )

  const featureType = resolveEmbeddedSignupFeatureType({
    connectExisting: params.connectExisting,
    transferPhoneNumber: params.transferPhoneNumber,
  })
  url.searchParams.set(
    "extras",
    JSON.stringify(buildEmbeddedSignupExtras(featureType)),
  )

  return url.toString()
}
