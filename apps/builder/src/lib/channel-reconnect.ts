import { z } from "zod"
import { connectTabPath } from "@/features/social-accounts/lib/connect-route"
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

/**
 * Adds outcome params to a sanitized referer. `sanitizeReferer` can fall back to
 * a relative path ("/manage"), which a bare `new URL` rejects — resolve against a
 * placeholder base and only keep the origin when the referer carried one.
 */
export function appendRedirectSearchParams(
  safeReferer: string,
  params: Record<string, string>,
): string {
  const isAbsolute = ABSOLUTE_URL_PATTERN.test(safeReferer)
  const url = new URL(safeReferer, getBrokerOrigin())
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value)
  }
  return isAbsolute ? url.toString() : `${url.pathname}${url.search}`
}

export function buildReconnectRedirectUrl(
  safeReferer: string,
  result: ReconnectResult,
): string {
  return appendRedirectSearchParams(
    safeReferer,
    result.status === "success"
      ? { reconnect: "success" }
      : { reconnect: "error", reason: result.reason },
  )
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
  return appendRedirectSearchParams(safeReferer, { error })
}

/**
 * Where a reconnect started outside Settings > Channels returns to. A closed
 * enum, never a URL: the reconnect action turns it into a path of its own, so a
 * caller cannot steer the OAuth round trip to another page.
 */
export const reconnectReturnToSchema = z.enum(["postsConnect"])
export type ReconnectReturnTo = z.infer<typeof reconnectReturnToSchema>

/**
 * The referer a reconnect action puts in the OAuth state: the Posts Connect tab
 * for `returnTo`, else the channel's own settings page. The callback sanitizes
 * the referer again before redirecting.
 */
export function buildReconnectReferer(input: {
  channel: "messenger" | "instagram" | "threads"
  origin: string
  returnTo: ReconnectReturnTo | undefined
  workspaceId: string
}): string {
  const path =
    input.returnTo === reconnectReturnToSchema.enum.postsConnect
      ? connectTabPath(input.workspaceId)
      : `/space/${input.workspaceId}/settings/channels?channel=${input.channel}`
  return new URL(path, input.origin).toString()
}
