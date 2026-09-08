/**
 * WhatsApp embedded-signup helpers.
 *
 * Instead of running the Facebook JS SDK (whose OAuth origin is bound to
 * `window.location`, so it breaks on a white-label reseller custom domain), we
 * open the Facebook OAuth dialog directly with `redirect_uri` set to the
 * Meta-registered host for the credential in use — the broker for
 * inherited/platform credentials, or the reseller's own custom domain for a
 * tenant-owned one (see `lib/provider-origin.ts`). Facebook returns the
 * `code` to that route, which relays it back to the originating reseller tab
 * via `window.opener.postMessage`. The reseller — where the session cookie
 * lives — exchanges the code and derives the WABA/phone/business ids
 * server-side.
 */

export const EMBEDDED_SIGNUP_FEATURE_TYPES = {
  WHATSAPP_BUSINESS_APP_ONBOARDING: "whatsapp_business_app_onboarding",
  ONLY_WABA_SHARING: "only_waba_sharing",
} as const

const EMBEDDED_SIGNUP_FEATURES = {
  MARKETING_MESSAGES_LITE: "marketing_messages_lite",
} as const

/**
 * Meta's `auth_type` values for the login dialog.
 *
 * Without one, the dialog does not re-ask for a permission the account did not
 * grant last time — Meta returns a code carrying the permissions it already
 * has. A reconnect whose whole purpose is to pick up a permission added to the
 * Embedded Signup configuration therefore has to say so explicitly.
 */
export const FACEBOOK_AUTH_TYPES = {
  REREQUEST: "rerequest",
} as const

export type FacebookAuthType =
  (typeof FACEBOOK_AUTH_TYPES)[keyof typeof FACEBOOK_AUTH_TYPES]

const FACEBOOK_DIALOG_BASE = "https://www.facebook.com"

/** Route Facebook redirects the `code` to — path only; see `redirectUri` above for the host. */
export const WHATSAPP_OAUTH_CALLBACK_PATH = "/integrations/whatsapp/callback"

/**
 * `window.postMessage` contract between the OAuth callback route and the
 * reseller tab. The reseller validates `event.origin` against the registered
 * callback origin before trusting it, and the callback route validates the
 * reseller origin (from `state`) before posting — so a signup `code` is
 * never relayed to an origin we do not control.
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

/**
 * Embedded Signup versions this app pins explicitly. Meta runs them side by
 * side — "the versions are not exclusive, partners can gradually roll out a new
 * version to reduce risk" — so one flow can move forward without dragging the
 * others with it.
 */
export const EMBEDDED_SIGNUP_VERSIONS = {
  V4: "v4",
} as const

export type EmbeddedSignupVersion =
  (typeof EMBEDDED_SIGNUP_VERSIONS)[keyof typeof EMBEDDED_SIGNUP_VERSIONS]

/** No `extras.version`: Meta picks its own default, which is what every flow did before v4. */
const UNPINNED_EMBEDDED_SIGNUP = "unpinned"

/**
 * `extras` is version-specific, so each version owns its builder instead of one
 * function accumulating conditionals.
 *
 * The v4 shape drops two things the older one carries: `marketing_messages_lite`
 * is no longer a feature there (it became a Login Configuration product), and
 * `sessionInfoVersion` is only needed by v2, since v3 onward returns session
 * info for every flow.
 */
const EMBEDDED_SIGNUP_EXTRAS_BUILDERS = {
  [UNPINNED_EMBEDDED_SIGNUP]: (featureType?: string) => ({
    sessionInfoVersion: 3,
    setup: {},
    features: [EMBEDDED_SIGNUP_FEATURES.MARKETING_MESSAGES_LITE],
    ...(featureType ? { featureType } : {}),
  }),
  [EMBEDDED_SIGNUP_VERSIONS.V4]: (featureType?: string) => ({
    setup: {},
    version: EMBEDDED_SIGNUP_VERSIONS.V4,
    ...(featureType ? { featureType } : {}),
  }),
} satisfies Record<string, (featureType?: string) => Record<string, unknown>>

export type FacebookOAuthDialogParams = {
  /** The reseller origin the callback relays the result back to. */
  resellerOrigin: string
  /**
   * Absolute callback URL registered with Meta for this credential — the
   * broker callback for inherited/platform credentials, or the reseller's
   * own custom domain callback for a tenant-owned one. Computed server-side
   * (see `lib/provider-origin.ts`) and passed in, since this module is
   * client-side and cannot resolve it itself.
   */
  redirectUri: string
  clientId: string
  configId: string
  version: string
  connectExisting: boolean
  transferPhoneNumber: boolean
  locale?: string
  /**
   * Set on a reconnect, left off on a first connect: the first connect has
   * nothing to re-ask for, and the dialog already shows every permission.
   */
  authType?: FacebookAuthType
  /**
   * Pins the Embedded Signup version for this flow. Left off, Meta uses its own
   * default — the behaviour every flow had before any version was pinned.
   */
  embeddedSignupVersion?: EmbeddedSignupVersion
}

/**
 * Build the absolute Facebook OAuth dialog URL to open in a popup.
 * `redirect_uri` is the caller-supplied, Meta-registered callback for this
 * credential; `state` carries the reseller origin so that callback route can
 * relay the `code` back to the right tab.
 */
export function buildFacebookOAuthDialogUrl(
  params: FacebookOAuthDialogParams,
): string {
  const url = new URL(`${FACEBOOK_DIALOG_BASE}/${params.version}/dialog/oauth`)
  url.searchParams.set("client_id", params.clientId)
  url.searchParams.set("config_id", params.configId)
  url.searchParams.set("redirect_uri", params.redirectUri)
  url.searchParams.set("response_type", "code")
  if (params.authType) {
    url.searchParams.set("auth_type", params.authType)
  }
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
  const buildExtras =
    EMBEDDED_SIGNUP_EXTRAS_BUILDERS[
      params.embeddedSignupVersion ?? UNPINNED_EMBEDDED_SIGNUP
    ]
  url.searchParams.set("extras", JSON.stringify(buildExtras(featureType)))

  return url.toString()
}
