import { SOCIAL_PROVIDER_CAPABILITIES } from "@chatbotx.io/utils/social-account"
import { appendRedirectSearchParams } from "@/lib/channel-reconnect"

const SOCIAL_CONNECT_ERROR_REASONS = [
  "cancelled",
  "notFound",
  "sessionExpired",
  "permissionNotGranted",
  "accountUnsupported",
  "notSupported",
  "failed",
] as const

export type SocialConnectErrorReason =
  (typeof SOCIAL_CONNECT_ERROR_REASONS)[number]

/**
 * Outcome of the publishing connect. Handlers return it instead of redirecting
 * so a try/catch around platform calls can never swallow the NEXT_REDIRECT
 * control-flow error — the OAuth callback owns every redirect. `reason` is null
 * on success; `missingPermissions` lists, verbatim, the permissions the dialog
 * did not grant (empty unless the reason is `permissionNotGranted`).
 */
export type SocialConnectResult = {
  missingPermissions: string[]
  ok: boolean
  reason: SocialConnectErrorReason | null
}

export const SOCIAL_CONNECT_SUCCESS: SocialConnectResult = {
  missingPermissions: [],
  ok: true,
  reason: null,
}

export const socialConnectFailure = (
  reason: SocialConnectErrorReason,
  missingPermissions: string[] = [],
): SocialConnectResult => ({ missingPermissions, ok: false, reason })

const KNOWN_PERMISSION_NAMES: ReadonlySet<string> = new Set(
  Object.values(SOCIAL_PROVIDER_CAPABILITIES).flatMap(
    (capability) => capability.requiredScopes,
  ),
)

const RESULT_PARAM = "socialConnect"
const REASON_PARAM = "socialReason"
const MISSING_PARAM = "socialMissing"

/** Where the OAuth callback sends the admin back to: the Posts page, carrying the outcome. */
export function buildSocialConnectRedirectUrl(
  safeReferer: string,
  result: SocialConnectResult,
): string {
  if (result.ok) {
    return appendRedirectSearchParams(safeReferer, {
      [RESULT_PARAM]: "success",
    })
  }
  return appendRedirectSearchParams(safeReferer, {
    [RESULT_PARAM]: "error",
    [REASON_PARAM]: result.reason ?? "failed",
    ...(result.missingPermissions.length > 0
      ? { [MISSING_PARAM]: result.missingPermissions.join(",") }
      : {}),
  })
}

/** Reads the outcome back off the Posts page URL; `null` when the page was not reached from a connect. */
export function readSocialConnectResult(
  searchParams: Pick<URLSearchParams, "get">,
): SocialConnectResult | null {
  const result = searchParams.get(RESULT_PARAM)
  if (result === "success") {
    return SOCIAL_CONNECT_SUCCESS
  }
  if (result !== "error") {
    return null
  }
  const reason = searchParams.get(REASON_PARAM)
  return {
    // Only the permission names publishing asks for are shown: a crafted link
    // must not make the page display arbitrary text.
    missingPermissions: (searchParams.get(MISSING_PARAM) ?? "")
      .split(",")
      .filter((name) => KNOWN_PERMISSION_NAMES.has(name)),
    ok: false,
    reason:
      SOCIAL_CONNECT_ERROR_REASONS.find((candidate) => candidate === reason) ??
      "failed",
  }
}
