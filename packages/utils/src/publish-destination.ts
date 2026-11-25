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
