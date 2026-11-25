import {
  type ChannelPostContentType,
  type ChannelPostLiveStatus,
  channelPostManagementSorts,
} from "@chatbotx.io/database/partials"
import { POST_MANAGEMENT_CHANNELS } from "@chatbotx.io/utils/channel"
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsString,
  parseAsStringEnum,
} from "nuqs"
import { POSTS_SHOW_OPTIONS } from "./posts-show"

export const POST_TYPE_FILTERS = [
  "photo",
  "video",
  "post",
  "pastLive",
  "liveNow",
] as const
export type PostTypeFilter = (typeof POST_TYPE_FILTERS)[number]

/** The filters that ask for live status, offered only when a channel reports it. */
const LIVE_POST_TYPE_FILTERS: readonly PostTypeFilter[] = [
  "pastLive",
  "liveNow",
]

/** Whether a post-type filter asks for live status (it may turn out unsupported). */
export const isLivePostType = (postType: PostTypeFilter | null): boolean =>
  postType !== null && LIVE_POST_TYPE_FILTERS.includes(postType)

/**
 * Whether the post list must wait for the inbox list: only a live filter does,
 * and only while the inboxes load (a failed inbox query must not leave the
 * list pending forever; `effectivePostType` then falls back to "all").
 */
export const postListWaitsForInboxes = (
  inboxStatus: "error" | "pending" | "success",
  postType: PostTypeFilter | null,
): boolean => inboxStatus === "pending" && isLivePostType(postType)

/**
 * The post type to apply: an old URL may name a live filter while no channel
 * reports live; it then falls back to "all" (`null`) instead of an empty list.
 */
export const effectivePostType = (
  postType: PostTypeFilter | null,
  liveSupported: boolean,
): PostTypeFilter | null =>
  postType && availablePostTypeFilters(liveSupported).includes(postType)
    ? postType
    : null

/** The post-type filters to offer: the live ones only when a channel reports live. */
export const availablePostTypeFilters = (
  liveSupported: boolean,
): PostTypeFilter[] =>
  POST_TYPE_FILTERS.filter(
    (type) => liveSupported || !LIVE_POST_TYPE_FILTERS.includes(type),
  )

/** The post-type filter entries in display order, "all" first. */
export const POST_TYPE_OPTIONS = ["all", ...POST_TYPE_FILTERS] as const
export type PostTypeOption = (typeof POST_TYPE_OPTIONS)[number]

/** What each post-type radio asks the list for. */
export const POST_TYPE_QUERIES: Record<
  PostTypeFilter,
  {
    contentTypes?: ChannelPostContentType[]
    liveStatus?: ChannelPostLiveStatus
  }
> = {
  photo: { contentTypes: ["photo", "carousel"] },
  video: { contentTypes: ["video", "reel"] },
  post: { contentTypes: ["text", "link", "story", "audio", "other"] },
  pastLive: { liveStatus: "ended" },
  liveNow: { liveStatus: "live" },
}

/** A comment-setting checkbox pair maps to this tri-state in the URL. */
const SWITCH_FILTERS = ["true", "false"] as const
export type SwitchFilter = (typeof SWITCH_FILTERS)[number]

/** The Posts page URL state: every filter is shareable and survives reload. */
export const postsSearchParsers = {
  allPosts: parseAsBoolean.withDefault(false),
  authorIds: parseAsArrayOf(parseAsString).withDefault([]),
  channels: parseAsArrayOf(
    parseAsStringEnum([...POST_MANAGEMENT_CHANNELS]),
  ).withDefault([]),
  from: parseAsString,
  hideComments: parseAsStringEnum([...SWITCH_FILTERS]),
  hidePhoneComments: parseAsStringEnum([...SWITCH_FILTERS]),
  inboxIds: parseAsArrayOf(parseAsString).withDefault([]),
  postType: parseAsStringEnum([...POST_TYPE_FILTERS]),
  search: parseAsString,
  show: parseAsStringEnum([...POSTS_SHOW_OPTIONS]).withDefault("channels"),
  skipComments: parseAsStringEnum([...SWITCH_FILTERS]),
  sort: parseAsStringEnum([...channelPostManagementSorts.options]).withDefault(
    "newest",
  ),
  to: parseAsString,
  topicIds: parseAsArrayOf(parseAsString).withDefault([]),
}
