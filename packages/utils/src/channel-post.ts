import { z } from "zod"

/**
 * What a post is, in channel-neutral terms. Each channel maps its own media
 * kinds onto one of these when it lists posts; `ChannelPost.mediaType` keeps
 * the raw provider value.
 */
export const channelPostContentTypes = z.enum([
  "text",
  "photo",
  "video",
  "reel",
  "carousel",
  "story",
  "live",
  "link",
  "audio",
  "other",
])
export type ChannelPostContentType = z.infer<typeof channelPostContentTypes>

export const channelPostLiveStatuses = z.enum(["scheduled", "live", "ended"])
export type ChannelPostLiveStatus = z.infer<typeof channelPostLiveStatuses>

/**
 * Where a live status observation came from. A `comment` observation is weak
 * evidence (it can start a live status, never reopen an ended one); the others
 * read the broadcast itself.
 */
export const channelPostLiveObservationSources = z.enum([
  "comment",
  "webhook",
  "reread",
])
export type ChannelPostLiveObservationSource = z.infer<
  typeof channelPostLiveObservationSources
>

/** A stored live row not observed for this long is re-read (a missed end event must still end it). */
export const CHANNEL_POST_LIVE_STALE_AFTER_MS = 10 * 60 * 1000

/**
 * What a channel can tell about a broadcast right now. `unknown` means the
 * read could not settle it (nothing found, a failed or ambiguous answer): the
 * caller leaves the stored status as it is.
 */
export const channelPostLiveStates = z.enum(["live", "ended", "unknown"])
export type ChannelPostLiveState = z.infer<typeof channelPostLiveStates>
