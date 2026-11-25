import { z } from "zod"
import type { SocialProvider } from "./social-account"
import type { PublisherKey } from "./social-publisher"

/**
 * What the last publish attempt (or the connect flow) learned about a
 * destination's permission to publish. `permissionMissing` is only written when
 * the network said so; it is cleared when the person reconnects.
 */
export const publishDestinationStatuses = z.enum(["ok", "permissionMissing"])
export type PublishDestinationStatus = z.infer<
  typeof publishDestinationStatuses
>

/**
 * What a person sees for a destination, derived from the inbox, its stored
 * token state and the permissions the network granted:
 * - `ready`: publishing can be attempted;
 * - `inboxDisconnected`: the inbox behind it is disconnected;
 * - `needsReconnect`: the stored token was rejected or expired;
 * - `permissionMissing`: a publishing permission is not granted.
 */
export const publishDestinationStates = z.enum([
  "ready",
  "inboxDisconnected",
  "needsReconnect",
  "permissionMissing",
])
export type PublishDestinationState = z.infer<typeof publishDestinationStates>

/**
 * Permissions each publisher needs, as the platforms document them. Instagram
 * through Facebook Login (`instagramFacebook`) needs the Page permissions too.
 */
export const PUBLISH_REQUIRED_SCOPES: Record<PublisherKey, readonly string[]> =
  {
    facebook: [
      "pages_manage_posts",
      "pages_read_engagement",
      "pages_show_list",
    ],
    instagram: [
      "instagram_business_basic",
      "instagram_business_content_publish",
    ],
    instagramFacebook: [
      "instagram_basic",
      "instagram_content_publish",
      "pages_read_engagement",
      "pages_show_list",
    ],
    threads: [
      "threads_basic",
      "threads_content_publish",
      "threads_manage_replies",
      "threads_delete",
    ],
    tiktok: ["user.info.basic", "video.publish"],
  }

/**
 * Where each publisher's granted permissions come from, as the platforms
 * document them (pages fetched from the official documentation):
 *
 * - `facebook`: `GET /debug_token?input_token=<Page token>` (Graph API
 *   reference "debug_token"). Fields: `scopes` ("List of permissions that the
 *   user has granted for the app in this access token."), `granular_scopes`,
 *   `is_valid` ("Whether the access token is still valid or not."). Needs "An
 *   app access token or an app developer's user access token for the app
 *   associated with the `input_token`".
 *   https://developers.facebook.com/docs/graph-api/reference/debug_token/
 * - `instagramFacebook`: the stored token is the Facebook Page token, so the
 *   same `debug_token` answers. (`GET /{user-id}/permissions`, "Returns a list
 *   of granted and declined permissions", is documented for a user id and does
 *   not state which token type it accepts; it is what the connect flow reads
 *   with the user's own login token, which is not stored.)
 *   https://developers.facebook.com/docs/graph-api/reference/user/permissions/
 * - `instagram` (Instagram Login, graph.instagram.com): the Business Login
 *   code exchange returns "a list of the permissions granted by the app user"
 *   (`permissions`). The long-lived token exchange and refresh answer only
 *   `access_token`, `token_type`, `expires_in`; no `debug_token` or permissions
 *   endpoint is documented for Instagram User tokens.
 *   https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
 * - `threads` (graph.threads.net): the token exchange answers `access_token`,
 *   `token_type`, `user_id`; the long-lived exchange and refresh answer
 *   `access_token`, `token_type`, `expires_in`. No documented way to read the
 *   granted permissions of a Threads token.
 *   https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions
 * - `tiktok`: the token and refresh responses carry `scope` ("A
 *   comma-separated list of the scopes the user authorized."); no other
 *   endpoint is documented. The minute refresh scan stores it.
 *   https://developers.tiktok.com/doc/oauth-refresh-a-user-access-token
 *
 * `recheck` names the documented source the Connect tab can read on demand
 * with the stored inbox token; `null`: nothing documented to call.
 */
export const publishScopeRecheckSources = z.enum(["debugToken"])
export type PublishScopeRecheckSource = z.infer<
  typeof publishScopeRecheckSources
>

export const PUBLISH_SCOPE_RECHECK_SOURCE: Record<
  PublisherKey,
  PublishScopeRecheckSource | null
> = {
  facebook: "debugToken",
  instagram: null,
  instagramFacebook: "debugToken",
  threads: null,
  tiktok: null,
}

/**
 * The `socialPostChanged` status the permission re-check job emits after it
 * wrote; the Connect tab refetches the destinations on it.
 */
export const SCOPES_RECHECKED_STATUS = "scopesRechecked"

/** Most destinations one re-check request covers. */
export const PUBLISH_SCOPE_RECHECK_MAX = 100
/** A destination is re-read at most once per this window (its Redis claim's TTL). */
export const PUBLISH_SCOPE_RECHECK_CLAIM_TTL_MS = 10 * 60 * 1000

/** What reading a token's permissions from the platform came back with. */
export const scopeReadKinds = z.enum([
  "scopes",
  "invalidToken",
  "unreported",
  "rateLimited",
  "failed",
])
export type ScopeReadKind = z.infer<typeof scopeReadKinds>

export type ScopeReadResult =
  | { kind: "scopes"; scopes: string[] }
  | { kind: Exclude<ScopeReadKind, "scopes"> }

/** The `data` of a `debug_token` answer, the fields the permission check reads. */
export type DebugTokenScopes = {
  is_valid?: boolean
  scopes?: unknown
}

/**
 * A `debug_token` answer as a scope read: `is_valid: false` is an invalid
 * token (its owner decides on reconnect), a `scopes` list of strings is the
 * granted permissions, anything else claims nothing.
 */
export const scopesFromDebugToken = (
  data: DebugTokenScopes,
): ScopeReadResult => {
  if (data.is_valid === false) {
    return { kind: "invalidToken" }
  }
  const { scopes } = data
  if (
    Array.isArray(scopes) &&
    scopes.every((scope): scope is string => typeof scope === "string")
  ) {
    return { kind: "scopes", scopes }
  }
  return { kind: "unreported" }
}

/** The inbox status value of a connected inbox (`Inbox.status`). */
const INBOX_CONNECTED = "connected"

export type PublishStateInput = {
  /** TikTok only: the publishing login and destination it is bound to. */
  socialAccount?: { isActive: boolean; status: string } | null
  /** `null` when the permissions were never captured. */
  grantedScopes: readonly string[] | null
  /** `Inbox.status`; `null` for a destination with no inbox (TikTok). */
  inboxStatus: string | null
  publishStatus: PublishDestinationStatus
  publisherKey: PublisherKey
  /** `Integration<X>.tokenRefreshError`; `null` when the token is fine. */
  tokenRefreshError: string | null
}

/** Scopes of `publisherKey` that are not in `grantedScopes`. */
export const missingPublishScopes = (
  publisherKey: PublisherKey,
  grantedScopes: readonly string[],
): string[] =>
  PUBLISH_REQUIRED_SCOPES[publisherKey].filter(
    (scope) => !grantedScopes.includes(scope),
  )

const deriveTiktokState = (
  input: PublishStateInput,
): PublishDestinationState => {
  const account = input.socialAccount
  if (account?.status !== "connected" || !account.isActive) {
    return "needsReconnect"
  }
  if (input.publishStatus === "permissionMissing") {
    return "permissionMissing"
  }
  if (
    input.grantedScopes &&
    missingPublishScopes("tiktok", input.grantedScopes).length > 0
  ) {
    return "permissionMissing"
  }
  return "ready"
}

/**
 * The state of a destination. First match wins:
 * 1. the inbox is disconnected;
 * 2. the stored token is rejected or expired;
 * 3. the network reported a missing permission, or a known scope list lacks a
 *    required one;
 * 4. Instagram with no captured scopes: it cannot be assumed to have the
 *    content-publish permission, which older connects never asked for;
 * 5. otherwise ready (Facebook and Threads with unknown scopes publish until a
 *    network error says otherwise).
 */
export const derivePublishState = (
  input: PublishStateInput,
): PublishDestinationState => {
  if (input.publisherKey === "tiktok") {
    return deriveTiktokState(input)
  }
  if (input.inboxStatus !== INBOX_CONNECTED) {
    return "inboxDisconnected"
  }
  if (input.tokenRefreshError) {
    return "needsReconnect"
  }
  if (input.publishStatus === "permissionMissing") {
    return "permissionMissing"
  }
  if (input.grantedScopes) {
    return missingPublishScopes(input.publisherKey, input.grantedScopes)
      .length > 0
      ? "permissionMissing"
      : "ready"
  }
  const isInstagram =
    input.publisherKey === "instagram" ||
    input.publisherKey === "instagramFacebook"
  return isInstagram ? "permissionMissing" : "ready"
}

/** The publisher of an inbox-bound destination (`null` provider combinations never occur). */
export const publisherKeyForInbox = (input: {
  provider: Exclude<SocialProvider, "tiktok">
  viaFacebook: boolean
}): PublisherKey =>
  input.provider === "instagram" && input.viaFacebook
    ? "instagramFacebook"
    : input.provider

const PROFILE_HOSTS = {
  facebook: "www.facebook.com",
  instagram: "www.instagram.com",
  threads: "www.threads.net",
  tiktok: "www.tiktok.com",
} as const satisfies Record<SocialProvider, string>

/** A network handle: letters, digits, dots, underscores, hyphens (no slashes, spaces, `@`). */
const HANDLE_PATTERN = /^[A-Za-z0-9._-]{1,100}$/
const FACEBOOK_ID_PATTERN = /^[0-9]{1,30}$/

const stripAt = (value: string): string =>
  value.startsWith("@") ? value.slice(1) : value

/**
 * The public profile URL of a page or profile on its network, or `null` when
 * the identifier is missing or not a plain handle. Always `https` and on the
 * network's own host, so a stored value can never point elsewhere.
 */
export const buildPublishDestinationProfileUrl = (input: {
  externalId: string | null
  provider: SocialProvider
  username: string | null
}): string | null => {
  const { externalId, provider } = input
  const username = input.username ? stripAt(input.username.trim()) : null
  let path: string | null = null
  if (provider === "facebook") {
    const id = externalId?.trim() ?? ""
    path = FACEBOOK_ID_PATTERN.test(id) ? id : null
  } else if (username && HANDLE_PATTERN.test(username)) {
    path = provider === "instagram" ? username : `@${username}`
  }
  if (path === null) {
    return null
  }
  const url = new URL(`https://${PROFILE_HOSTS[provider]}/${path}`)
  return url.protocol === "https:" && url.hostname === PROFILE_HOSTS[provider]
    ? url.toString()
    : null
}
