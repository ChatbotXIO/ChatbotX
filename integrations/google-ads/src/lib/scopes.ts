import { DATA_MANAGER_SCOPE, GOOGLE_ADS_API_SCOPE } from "../constants"

/** How a conversion reaches Google; mirrors `GoogleAdsUploadMethod` in `@chatbotx.io/database`. */
export type GoogleAdsUploadMethod = "dataManager" | "legacy"

/** What an absent or unrecognised method means (rows saved before the choice existed). */
const DEFAULT_UPLOAD_METHOD: GoogleAdsUploadMethod = "dataManager"

const SCOPE_SEPARATOR = /\s+/

/** Identity scopes requested alongside the API ones, whatever the method. */
const IDENTITY_SCOPES: readonly string[] = ["openid", "email"]

export const parseUploadMethod = (value: unknown): GoogleAdsUploadMethod =>
  value === "legacy" ? "legacy" : DEFAULT_UPLOAD_METHOD

/** The method a connection's `auth.metadata` pins; absent = Data Manager. */
export const uploadMethodOf = (
  auth:
    | {
        metadata?: { uploadMethod?: unknown } | null
      }
    | null
    | undefined,
): GoogleAdsUploadMethod => parseUploadMethod(auth?.metadata?.uploadMethod)

/**
 * The one resolver for what a method needs from the Google grant: the Ads API
 * sets an account up (both methods), Data Manager additionally sends the
 * conversions. The legacy upload API needs `adwords` only.
 */
export const requiredScopesFor = (
  method: GoogleAdsUploadMethod,
): readonly string[] =>
  method === "dataManager"
    ? [GOOGLE_ADS_API_SCOPE, DATA_MANAGER_SCOPE]
    : [GOOGLE_ADS_API_SCOPE]

/** Scopes the authorize URL asks for (required + identity). */
export const authorizeScopesFor = (
  method: GoogleAdsUploadMethod,
): readonly string[] => [...requiredScopesFor(method), ...IDENTITY_SCOPES]

/** Space-delimited, case-sensitive scope string -> list (OAuth 2.0 `scope` format). */
export const parseScopes = (scope: string): string[] =>
  scope.split(SCOPE_SEPARATOR).filter(Boolean)

/**
 * The scopes `method` requires that are absent from `granted`. A user may
 * untick one on Google's granular consent screen, so the grant must be checked
 * after the exchange
 * (https://developers.google.com/identity/protocols/oauth2/web-server).
 */
export const missingRequiredScopes = (
  granted: readonly string[],
  method: GoogleAdsUploadMethod = DEFAULT_UPLOAD_METHOD,
): string[] =>
  requiredScopesFor(method).filter((scope) => !granted.includes(scope))

/**
 * The method an authorization was made for. The scopes Google granted are the
 * binding: a Data Manager grant carries `datamanager`, a legacy one never does,
 * so a credential switched while the consent was open cannot change what was
 * authorized. Under a Data Manager credential a grant without `datamanager` is
 * never downgraded (the user unticked it): it stays Data Manager and fails the
 * scope check.
 */
export const methodOfGrant = (
  credentialMethod: GoogleAdsUploadMethod,
  granted: readonly string[],
): GoogleAdsUploadMethod =>
  credentialMethod === "dataManager" || granted.includes(DATA_MANAGER_SCOPE)
    ? "dataManager"
    : "legacy"

/**
 * Whether the grant stored on a connection still covers its method. A row
 * without a recorded scope predates the check and passes.
 */
export const hasRequiredScopes = (
  auth:
    | {
        metadata?: { scope?: string; uploadMethod?: unknown } | null
      }
    | null
    | undefined,
): boolean => {
  const storedScope = auth?.metadata?.scope
  return (
    !storedScope ||
    missingRequiredScopes(parseScopes(storedScope), uploadMethodOf(auth))
      .length === 0
  )
}

export const SCOPE_MISSING_MESSAGES: Record<GoogleAdsUploadMethod, string> = {
  dataManager: "Google Ads and Data Manager permissions were not both granted",
  legacy: "Google Ads permission was not granted",
}
