/**
 * better-auth redirects every OAuth callback failure to
 * `/api/auth/error?error=<code>`; in production that route answers
 * `302 /?error=<code>`, and the sign-in proxy then lands on
 * `/auth/sign-in?callbackURL=https://<host>/?error=<code>`. So the code arrives
 * either directly or nested inside `callbackURL`.
 */
export type OAuthErrorKey =
  | "accountNotLinked"
  | "unableToLinkAccount"
  | "sessionExpired"
  | "accessDenied"
  | "generic"

/** better-auth codes that deserve a specific message; anything else is generic. */
const OAUTH_ERROR_KEYS_BY_CODE: Record<string, OAuthErrorKey> = {
  account_not_linked: "accountNotLinked",
  unable_to_link_account: "unableToLinkAccount",
  account_already_linked_to_different_user: "unableToLinkAccount",
  state_mismatch: "sessionExpired",
  state_not_found: "sessionExpired",
  state_invalid: "sessionExpired",
  access_denied: "accessDenied",
}

/** Exhaustive literal map so `t()` never receives a template string. */
export const OAUTH_ERROR_MESSAGE_KEYS: Record<OAuthErrorKey, string> = {
  accountNotLinked: "auth.oauthError.accountNotLinked",
  unableToLinkAccount: "auth.oauthError.unableToLinkAccount",
  sessionExpired: "auth.oauthError.sessionExpired",
  accessDenied: "auth.oauthError.accessDenied",
  generic: "auth.oauthError.generic",
}

const readNestedError = (
  callbackURL: string | null,
  currentOrigin: string,
): string | null => {
  if (!callbackURL) {
    return null
  }
  try {
    const url = new URL(callbackURL, currentOrigin)
    return url.origin === currentOrigin ? url.searchParams.get("error") : null
  } catch {
    return null
  }
}

export function resolveOAuthErrorKey(
  searchParams: URLSearchParams,
  currentOrigin: string,
): OAuthErrorKey | null {
  const code =
    searchParams.get("error") ??
    readNestedError(searchParams.get("callbackURL"), currentOrigin)
  if (!code) {
    return null
  }
  return Object.hasOwn(OAUTH_ERROR_KEYS_BY_CODE, code)
    ? OAUTH_ERROR_KEYS_BY_CODE[code]
    : "generic"
}
