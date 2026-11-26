import type { SocialProvider } from "@chatbotx.io/database/partials"
import type { PublishDestinationStateRow } from "@chatbotx.io/database/repositories"
import type { PublishDestinationState } from "@chatbotx.io/utils/publish-destination"
import type { PublishPauseReason } from "@chatbotx.io/utils/publish-limits"
import type { PublisherKey } from "@chatbotx.io/utils/social-publisher"
import { getPublicFileUrl } from "../utils"

/**
 * What any caller may see of a publishing destination. There is deliberately no
 * token, auth blob or token fingerprint on it.
 */
export type PublishDestinationDto = {
  avatar: string | null
  checkedAt: Date | null
  externalId: string | null
  id: string
  /** The inbox that publishes (Facebook, Instagram, Threads); `null` for TikTok. */
  inboxId: string | null
  /** The channel integration row behind the inbox (what a reconnect targets); `null` for TikTok. */
  integrationId: string | null
  missingScopes: string[]
  name: string | null
  /**
   * Publishing is paused until then because the network limited the account
   * (docs/posts.md, "Publishing pace and platform limits"). Posts due before it
   * wait and publish after it; `null` when not paused.
   */
  pausedUntil: Date | null
  pauseReason: PublishPauseReason | null
  /** The page or profile's public URL on its network; `null` when unknown. */
  profileUrl: string | null
  provider: SocialProvider
  publisherKey: PublisherKey
  /** The TikTok publishing login; `null` for the inbox networks. */
  socialAccountId: string | null
  state: PublishDestinationState
  username: string | null
  /** An Instagram inbox connected through a Facebook Page. */
  viaFacebook: boolean
}

/**
 * `avatar` is a public URL: an inbox destination stores the path of our
 * re-hosted copy (made absolute against the workspace's storage URL), TikTok
 * stores the network's own absolute URL (returned unchanged). An inbox with no
 * stored copy yet gets `proxyAvatarUrl`, the signed on-view route that resolves
 * and mirrors the picture (null: nothing to fetch, the UI shows its icon).
 */
export const toPublishDestinationDto = (
  row: PublishDestinationStateRow,
  storageUrl: string,
  proxyAvatarUrl: string | null = null,
  now: Date = new Date(),
): PublishDestinationDto => {
  // An elapsed pause has no effect, so it is not shown.
  const paused = row.pausedUntil !== null && row.pausedUntil > now
  return {
    avatar: row.avatar
      ? getPublicFileUrl(row.avatar, storageUrl)
      : proxyAvatarUrl,
    checkedAt: row.checkedAt,
    externalId: row.externalId,
    id: row.id,
    inboxId: row.inboxId,
    integrationId: row.integrationId,
    missingScopes: row.missingScopes,
    name: row.name,
    pausedUntil: paused ? row.pausedUntil : null,
    pauseReason: paused ? row.pauseReason : null,
    profileUrl: row.profileUrl,
    provider: row.provider,
    publisherKey: row.publisherKey,
    socialAccountId: row.socialAccountId,
    state: row.state,
    username: row.username,
    viaFacebook: row.viaFacebook,
  }
}
