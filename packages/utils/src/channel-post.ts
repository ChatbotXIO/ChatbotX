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

/**
 * What reading one post from its channel right away came to: the counts were
 * written (`refreshed`), the channel confirmed the post is gone (`removed`),
 * the channel could not be reached or answered with an error
 * (`channelUnavailable`), it asked us to slow down (`rateLimited`), or the post
 * was refreshed in the last minute and nothing was read (`cooldown`).
 */
export const channelPostRefreshOutcomes = z.enum([
  "refreshed",
  "removed",
  "channelUnavailable",
  "rateLimited",
  "cooldown",
])
export type ChannelPostRefreshOutcome = z.infer<
  typeof channelPostRefreshOutcomes
>

/** A post whose counts were read less than this long ago is not re-read when the Posts page asks for fresh counts. */
export const CHANNEL_POST_METRICS_STALE_MS = 5 * 60 * 1000

/** Most posts one fresh-counts request (and one batch read of a channel) carries. */
export const CHANNEL_POST_METRICS_BATCH_MAX = 50

/** A stored live row not observed for this long is re-read (a missed end event must still end it). */
export const CHANNEL_POST_LIVE_STALE_AFTER_MS = 10 * 60 * 1000

/**
 * What a channel can tell about a broadcast right now. `unknown` means the
 * read could not settle it (nothing found, a failed or ambiguous answer): the
 * caller leaves the stored status as it is.
 */
export const channelPostLiveStates = z.enum(["live", "ended", "unknown"])
export type ChannelPostLiveState = z.infer<typeof channelPostLiveStates>

/**
 * How a channel delivers one of the business's own posts into a conversation.
 * - `nativeMedia`: the platform's own post share (a post card the contact can
 *   open), sent by the post's platform id.
 * - `textLink`: a plain text message holding the post's name and permalink.
 *   Any channel without a verified native share uses it.
 */
export const channelPostShareModes = ["nativeMedia", "textLink"] as const
export type ChannelPostShareMode = (typeof channelPostShareModes)[number]

/**
 * Why a post cannot be sent into a conversation. Each is a typed refusal: the
 * composer shows it, the public API returns it as `data.reason`, and a flow
 * run records it in the Error Log.
 */
export const channelPostShareRefusalReasons = [
  "channelPostNotFound",
  "channelPostInboxMismatch",
  "channelPostTypeNotShareable",
  "channelPostShareUnsupported",
  "channelPostLinkUnavailable",
  "channelPostLinkTooLong",
] as const
export type ChannelPostShareRefusalReason =
  (typeof channelPostShareRefusalReasons)[number]
