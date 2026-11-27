import { z } from "zod"
import type { PostManagementChannel } from "./channel"

/**
 * The networks a workspace can connect a social account on, separately from its
 * inbox channels. A new network is one value here plus one provider adapter.
 */
export const socialProviders = z.enum([
  "facebook",
  "instagram",
  "threads",
  "tiktok",
])
export type SocialProvider = z.infer<typeof socialProviders>

/**
 * `connected` publishes; `needsReauth` lost its token or a permission and waits
 * for the person to reconnect; `disconnected` was removed on purpose and holds
 * no token.
 */
export const socialAccountStatuses = z.enum([
  "connected",
  "needsReauth",
  "disconnected",
])
export type SocialAccountStatus = z.infer<typeof socialAccountStatuses>

/**
 * Why an account is not `connected`. A finite set so the UI can map each code to
 * a translation; which permissions are missing is not part of the code (read
 * `missingScopes` of the account).
 *
 * - `tokenRejected`: the platform rejected the stored token when it was checked.
 * - `tokenExpired`: the token expired before it could be refreshed.
 * - `refreshRejected`: the platform refused to refresh the token.
 * - `permissionNotGranted`: a permission publishing needs is not granted.
 */
export const socialAccountStatusReasons = z.enum([
  "tokenRejected",
  "tokenExpired",
  "refreshRejected",
  "permissionNotGranted",
])
export type SocialAccountStatusReason = z.infer<
  typeof socialAccountStatusReasons
>

/** A Facebook Page, or the one profile an Instagram, Threads or TikTok login owns. */
export const socialDestinationKinds = z.enum(["page", "profile"])
export type SocialDestinationKind = z.infer<typeof socialDestinationKinds>

/** What a network can publish; the per-network set is `enabledContentTypes` of the publishing rules. */
export const socialContentTypes = z.enum([
  "text",
  "link",
  "image",
  "video",
  "carousel",
  "reel",
  "story",
])
export type SocialContentType = z.infer<typeof socialContentTypes>

export type SocialProviderCapability = {
  /** The person can connect an account on this network today. */
  connectSupported: boolean
  /** What a destination is on this network. */
  destinationKind: SocialDestinationKind
  /** Permissions the connect dialog asks for — profile read and publishing only. */
  requiredScopes: readonly string[]
}

/**
 * Scope names are the ones the platform documents for its login dialog:
 * Facebook Pages publishing (`pages_manage_posts`, `pages_read_engagement`,
 * `pages_show_list` to read the Pages), Instagram API with Instagram Login and
 * the Threads API (`*_basic` plus `*_content_publish`).
 *
 * TikTok uses the Content Posting API with Login Kit (its own app, separate from
 * the inbox integration): `user.info.basic` reads the name and avatar,
 * `video.publish` posts directly and creator info needs it (`video.upload`, the
 * draft scope, is not used). Photo posts (`image`) need a TikTok-verified URL prefix for
 * the media, which the product cannot guarantee, so only `video` is offered.
 * https://developers.tiktok.com/docs/en/scopes-overview
 * https://developers.tiktok.com/docs/en/content-posting-api-get-started
 */
export const SOCIAL_PROVIDER_CAPABILITIES: Record<
  SocialProvider,
  SocialProviderCapability
> = {
  facebook: {
    // Publishes with the inbox integration token, never a separate login.
    connectSupported: false,
    destinationKind: "page",
    requiredScopes: [
      "pages_show_list",
      "pages_manage_posts",
      "pages_read_engagement",
    ],
  },
  instagram: {
    // Publishes with the inbox integration token, never a separate login.
    connectSupported: false,
    destinationKind: "profile",
    requiredScopes: [
      "instagram_business_basic",
      "instagram_business_content_publish",
    ],
  },
  threads: {
    // Publishes with the inbox integration token, never a separate login.
    connectSupported: false,
    destinationKind: "profile",
    requiredScopes: [
      "threads_basic",
      "threads_content_publish",
      "threads_manage_replies",
      "threads_delete",
    ],
  },
  tiktok: {
    // The code path exists; the Accounts page enables the button only when the
    // owner configured the publishing app (see `connectableSocialProviders`).
    connectSupported: true,
    destinationKind: "profile",
    requiredScopes: ["user.info.basic", "video.publish"],
  },
}

/** Most Pages one Facebook login keeps as destinations (a login can own thousands). */
export const MAX_SOCIAL_DESTINATIONS_PER_ACCOUNT = 100

/** The Facebook Page task that lets a person publish as the Page. */
export const FACEBOOK_PUBLISH_TASK = "CREATE_CONTENT"

/** Scopes the connect dialog requires that the platform did not grant. */
export const missingSocialScopes = (
  provider: SocialProvider,
  grantedScopes: readonly string[],
): string[] =>
  SOCIAL_PROVIDER_CAPABILITIES[provider].requiredScopes.filter(
    (scope) => !grantedScopes.includes(scope),
  )

/** One place the connected account can publish to, exactly as the platform listed it. */
export type ConnectedSocialDestination = {
  avatar: string | null
  /** The destination's own access token; null when the account token is used. */
  accessToken: string | null
  externalId: string
  /** `false` for a Page the person cannot publish to (no `CREATE_CONTENT` task). */
  isActive: boolean
  kind: SocialDestinationKind
  name: string
  username: string | null
}

/** What a provider adapter reads from the platform after the code exchange. */
export type ConnectedSocialAccount = {
  accessToken: string
  avatar: string | null
  destinations: ConnectedSocialDestination[]
  displayName: string
  externalAccountId: string
  /** Permissions the platform reports as granted (or the requested ones when it reports none). */
  grantedScopes: string[]
  /** Only TikTok connects a social account; Meta networks publish with inbox tokens. */
  provider: Extract<SocialProvider, "tiktok">
  refreshToken: string | null
  /** `null` when the account token never expires. */
  tokenExpiresAt: Date | null
  username: string | null
}

/**
 * Whether an inbox page or profile can publish today: `ready` (account
 * connected, destination active, nothing missing), `needsReconnect` (the login
 * needs a reconnect, a permission is missing or the platform no longer lists the
 * Page) or `notConnected` (no publishing login covers it).
 */
export const socialPublishingStates = z.enum([
  "ready",
  "needsReconnect",
  "notConnected",
])
export type SocialPublishingState = z.infer<typeof socialPublishingStates>

/** The inbox channel whose pages a social network's logins can publish to. */
export const SOCIAL_PROVIDER_INBOX_CHANNEL: Record<
  SocialProvider,
  PostManagementChannel
> = {
  facebook: "messenger",
  instagram: "instagram",
  threads: "threads",
  tiktok: "tiktok",
}

/** The publishing state of a destination of a login in `accountStatus`. */
export const deriveSocialPublishingState = (input: {
  accountStatus: SocialAccountStatus
  isActive: boolean
  missingScopes: readonly string[]
}): SocialPublishingState =>
  input.accountStatus === "connected" &&
  input.isActive &&
  input.missingScopes.length === 0
    ? "ready"
    : "needsReconnect"
