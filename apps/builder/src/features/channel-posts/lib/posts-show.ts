import type { PostManagementChannel } from "@chatbotx.io/utils/channel"
import type { SocialProvider } from "@chatbotx.io/utils/social-account"
import type { SocialPostBucket } from "@chatbotx.io/utils/social-post"

/**
 * What the Posts tab shows, left to right: the posts on the channels (the
 * synced table) or one bucket of composed posts.
 */
export const POSTS_SHOW_OPTIONS = [
  "channels",
  "drafts",
  "scheduled",
  "needsAttention",
  "published",
] as const satisfies readonly (SocialPostBucket | "channels")[]
export type PostsShow = (typeof POSTS_SHOW_OPTIONS)[number]

/** The composed-post bucket a choice lists, or `undefined` for the channel table. */
export const bucketOfShow = (show: PostsShow): SocialPostBucket | undefined =>
  show === "channels" ? undefined : show

/** The publishing network of each channel that has composed posts (a Messenger inbox publishes to its Facebook Page). */
const PROVIDER_OF_CHANNEL: Record<PostManagementChannel, SocialProvider> = {
  instagram: "instagram",
  messenger: "facebook",
  threads: "threads",
  tiktok: "tiktok",
}

/** What the Posts tab's shared filters narrow a composed-post list by. */
export type ComposedNarrowing = {
  from?: Date
  inboxIds?: string[]
  providers?: SocialProvider[]
  search?: string
  to?: Date
}

const startOfDay = (value: string | null): Date | undefined =>
  value ? new Date(`${value}T00:00:00`) : undefined
const endOfDay = (value: string | null): Date | undefined =>
  value ? new Date(`${value}T23:59:59.999`) : undefined

/**
 * The shared filters (channel, page / account, search, date range) as the
 * composed-post list's own: channels become networks, pages become inboxes,
 * the dates keep posts with a destination scheduled or published in the range.
 */
export const composedNarrowingOf = (filters: {
  channels: readonly PostManagementChannel[]
  from: string | null
  inboxIds: readonly string[]
  search: string | null
  to: string | null
}): ComposedNarrowing => ({
  from: startOfDay(filters.from),
  inboxIds: filters.inboxIds.length ? [...filters.inboxIds] : undefined,
  providers: filters.channels.length
    ? filters.channels.map((channel) => PROVIDER_OF_CHANNEL[channel])
    : undefined,
  search: filters.search ?? undefined,
  to: endOfDay(filters.to),
})
