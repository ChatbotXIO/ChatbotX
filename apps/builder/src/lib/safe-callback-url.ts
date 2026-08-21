const PROTOCOL_RELATIVE_PREFIXES = ["//", "/\\"]

/**
 * Resolve a `?callbackURL` into a same-origin path safe to redirect to.
 *
 * The proxy writes an absolute URL on the current public host
 * (`proxy.ts` `buildSigninUrl`), so on a white-label custom domain the
 * callback already points at the domain the user is on. We accept a target
 * only when its origin matches the page we're currently on: that keeps
 * white-label domains working (the user stays on their branded host) while
 * making an attacker-supplied `?callbackURL=` to a foreign origin inert.
 *
 * Always returns a path (never an absolute URL), so the eventual redirect is
 * same-origin by construction regardless of how it's issued.
 */
export function resolveSafeCallbackUrl(
  raw: string | null | undefined,
  currentOrigin: string,
  fallback = "/",
): string {
  if (!raw) {
    return fallback
  }

  if (PROTOCOL_RELATIVE_PREFIXES.some((prefix) => raw.startsWith(prefix))) {
    return fallback
  }

  if (raw.startsWith("/")) {
    return raw
  }

  try {
    const target = new URL(raw)
    if (target.origin !== currentOrigin) {
      return fallback
    }
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return fallback
  }
}

/**
 * Append a `callbackURL` query param to `path` so it survives a client-side
 * navigation (e.g. the sign-in ↔ sign-up cross-links). Not a security
 * boundary — `resolveSafeCallbackUrl` is what sanitizes the value when it's
 * eventually consumed for a redirect.
 */
export function withCallbackUrlParam(
  path: string,
  callbackURL: string | null | undefined,
): string {
  if (!callbackURL) {
    return path
  }

  return `${path}?callbackURL=${encodeURIComponent(callbackURL)}`
}
