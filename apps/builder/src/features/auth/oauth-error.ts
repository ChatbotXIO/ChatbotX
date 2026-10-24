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
  | "signUpDisabled"
  | "invalidInvitation"
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
  signup_disabled: "signUpDisabled",
  invalid_invitation: "invalidInvitation",
}

/** Exhaustive literal map so `t()` never receives a template string. */
export const OAUTH_ERROR_MESSAGE_KEYS: Record<OAuthErrorKey, string> = {
  accountNotLinked: "auth.oauthError.accountNotLinked",
  unableToLinkAccount: "auth.oauthError.unableToLinkAccount",
  sessionExpired: "auth.oauthError.sessionExpired",
  accessDenied: "auth.oauthError.accessDenied",
  signUpDisabled: "auth.oauthError.signUpDisabled",
  invalidInvitation: "auth.oauthError.invalidInvitation",
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

/** Same-origin `callbackURL` with its `error` dropped, or `null` when it carries none. */
const callbackWithoutError = (
  callbackURL: string,
  currentOrigin: string,
): string | null => {
  let url: URL
  try {
    url = new URL(callbackURL, currentOrigin)
  } catch {
    return null
  }
  if (url.origin !== currentOrigin || !url.searchParams.has("error")) {
    return null
  }
  url.searchParams.delete("error")
  const rest = `${url.pathname}${url.search}${url.hash}`
  // Keep the shape the proxy used: relative in, relative out.
  return callbackURL.startsWith("/") ? rest : `${url.origin}${rest}`
}

/**
 * `path` (pathname + search + hash) with the OAuth error code removed, both a
 * direct `?error=` and one nested in a same-origin `callbackURL`, which itself
 * is kept so sign-in still lands where it should. `null` when there is nothing
 * to remove. The sign-in alert uses it so a reload does not replay an old
 * failure.
 */
export function withoutOAuthError(
  path: string,
  currentOrigin: string,
): string | null {
  const url = new URL(path, currentOrigin)
  let changed = false
  if (url.searchParams.has("error")) {
    url.searchParams.delete("error")
    changed = true
  }
  const callbackURL = url.searchParams.get("callbackURL")
  const cleanedCallback = callbackURL
    ? callbackWithoutError(callbackURL, currentOrigin)
    : null
  if (cleanedCallback !== null) {
    url.searchParams.set("callbackURL", cleanedCallback)
    changed = true
  }
  return changed ? `${url.pathname}${url.search}${url.hash}` : null
}
