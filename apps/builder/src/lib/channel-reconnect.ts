import { getBrokerOrigin } from "./oauth-broker"

export const RECONNECT_ERROR_REASONS = [
  "notFound",
  "pageNotFound",
  "accountNotFound",
  "cancelled",
  "failed",
] as const

export type ReconnectErrorReason = (typeof RECONNECT_ERROR_REASONS)[number]

/**
 * Outcome of an OAuth reconnect handler. Handlers return a result instead of
 * redirecting so a try/catch around Graph API calls can never swallow the
 * NEXT_REDIRECT control-flow error — the OAuth callback owns every redirect.
 */
export type ReconnectResult =
  | { status: "success" }
  | { status: "error"; reason: ReconnectErrorReason }

const ABSOLUTE_URL_PATTERN = /^https?:\/\//i

export function buildReconnectRedirectUrl(
  safeReferer: string,
  result: ReconnectResult,
): string {
  // sanitizeReferer can fall back to a relative path ("/manage"), which a
  // bare `new URL` rejects — resolve against a placeholder base and only
  // keep the origin when the referer carried one.
  const isAbsolute = ABSOLUTE_URL_PATTERN.test(safeReferer)
  const url = new URL(safeReferer, getBrokerOrigin())
  if (result.status === "success") {
    url.searchParams.set("reconnect", "success")
  } else {
    url.searchParams.set("reconnect", "error")
    url.searchParams.set("reason", result.reason)
  }
  return isAbsolute ? url.toString() : `${url.pathname}${url.search}`
}

export const CHANNEL_CONNECT_ERRORS = [
  /** The account is already connected, here or in another workspace. */
  "duplicated",
  /** The user withheld a permission the channel cannot work without. */
  "missingScopes",
] as const

export type ChannelConnectError = (typeof CHANNEL_CONNECT_ERRORS)[number]

/**
 * The connect-flow counterpart of `buildReconnectRedirectUrl`: relays back to
 * the originating (possibly branded) referer with the `?error=` param that
 * `useChannelConnectError` reads. Channels whose connect runs in a server
 * action redirect to a fixed settings path instead; an OAuth callback cannot,
 * because the branded origin only survives in the referer.
 */
export function buildChannelErrorRedirectUrl(
  safeReferer: string,
  error: ChannelConnectError,
): string {
  const isAbsolute = ABSOLUTE_URL_PATTERN.test(safeReferer)
  const url = new URL(safeReferer, getBrokerOrigin())
  url.searchParams.set("error", error)
  return isAbsolute ? url.toString() : `${url.pathname}${url.search}`
}
