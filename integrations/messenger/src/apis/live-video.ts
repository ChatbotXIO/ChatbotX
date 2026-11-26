import type {
  ChannelLiveBroadcast,
  ChannelPostListItem,
  ChannelPostLiveState,
  ChannelPostLiveStatus,
} from "@chatbotx.io/sdk"
import { z } from "zod"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type { MessengerAuthValue } from "../schema"

/**
 * Fields read from a LiveVideo (`status`, `title`, `description`,
 * `creation_time`, `broadcast_start_time`, `permalink_url`, `video`) and from
 * the video it wraps (`post_id`, `live_status`), all named by the Graph API
 * reference of the LiveVideo and Video nodes.
 */
export const LIVE_VIDEO_FIELDS =
  "id,status,title,description,creation_time,broadcast_start_time,permalink_url,video{id,post_id,live_status}"

export type FacebookLiveVideo = {
  broadcast_start_time?: string
  creation_time?: string
  description?: string
  id: string
  permalink_url?: string
  status?: string
  title?: string
  video?: { id?: string; live_status?: string; post_id?: string }
}

type LiveBroadcastStatus = Extract<ChannelPostLiveStatus, "live" | "ended">

/**
 * What a `LiveVideo.status` (the node's value, or the `broadcast_status` filter
 * of the Page `live_videos` edge) means for a post. One table for the sync, the
 * webhook job and the state read. Anything not listed, scheduled, unpublished
 * or canceled records nothing (an unknown value is never defaulted to ended).
 * Values: https://developers.facebook.com/docs/graph-api/reference/page/live_videos/
 */
export const liveBroadcastStatuses = z.enum([
  "LIVE",
  "LIVE_NOW",
  "LIVE_STOPPED",
  "VOD",
  "PROCESSING",
])

const BROADCAST_STATUS_MEANING: Record<
  z.infer<typeof liveBroadcastStatuses>,
  LiveBroadcastStatus
> = {
  LIVE: "live",
  LIVE_NOW: "live",
  LIVE_STOPPED: "ended",
  PROCESSING: "ended",
  VOD: "ended",
}

/**
 * The `broadcast_status` filter the listings send, so scheduled and unpublished
 * broadcasts are not fetched (`LIVE_NOW` is the node's own spelling of `LIVE`
 * and is not a filter value). Sent as a JSON array, the encoding the repo uses
 * for Graph list parameters.
 */
export const LIVE_BROADCAST_STATUS_FILTER = JSON.stringify([
  "LIVE",
  "LIVE_STOPPED",
  "VOD",
  "PROCESSING",
])

/** What a LiveVideo's status says, or `null` when it describes nothing to record. */
export const liveVideoBroadcastStatus = (
  video: Pick<FacebookLiveVideo, "status">,
): LiveBroadcastStatus | null => {
  const parsed = liveBroadcastStatuses.safeParse(video.status)
  return parsed.success ? BROADCAST_STATUS_MEANING[parsed.data] : null
}

const toDate = (value: string | undefined): Date | null => {
  if (!value) {
    return null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

type LiveVideoPost = {
  caption: string | null
  externalPostId: string
  liveStatus: LiveBroadcastStatus
  permalink: string | null
  publishedAt: Date | null
}

/**
 * The post a LiveVideo lives in. The id is the video's `post_id` as the Graph
 * API returns it, the id the `feed` webhook reports comments by and the one the
 * Page feed lists, so a broadcast that is also in the feed is one post. A
 * broadcast without one is skipped (never rebuilt from other ids).
 */
const toLiveVideoPost = (video: FacebookLiveVideo): LiveVideoPost | null => {
  const liveStatus = liveVideoBroadcastStatus(video)
  if (!liveStatus) {
    return null
  }
  const externalPostId = video.video?.post_id
  if (!externalPostId) {
    logger.warn(
      { liveVideoId: video.id },
      "Facebook live video has no post_id, skipping it",
    )
    return null
  }
  return {
    caption: video.description ?? video.title ?? null,
    externalPostId,
    liveStatus,
    permalink: video.permalink_url ?? null,
    publishedAt: toDate(video.broadcast_start_time ?? video.creation_time),
  }
}

/** A LiveVideo as one entry of the Posts listing, or `null` when it is not a broadcast to track. */
export const toLiveListItem = (
  video: FacebookLiveVideo,
): ChannelPostListItem | null => {
  const post = toLiveVideoPost(video)
  return post
    ? {
        authorExternalId: null,
        authorName: null,
        caption: post.caption,
        commentsCount: null,
        contentType: "live",
        externalPostId: post.externalPostId,
        liveStatus: post.liveStatus,
        mediaType: "live",
        permalink: post.permalink,
        publishedAt: post.publishedAt,
        reactionsCount: null,
        sharesCount: null,
        thumbnailUrl: null,
        viewsCount: null,
      }
    : null
}

/** One broadcast by its own id (the id a `live_videos` webhook names). */
export const readLiveBroadcast = (props: {
  auth: MessengerAuthValue
  liveVideoId: string
}): Promise<ChannelLiveBroadcast | null> => {
  const { auth, liveVideoId } = props
  const endpoint = `${auth.version ?? DEFAULT_API_VERSION}/${liveVideoId}`
  return rescue(endpoint, async () => {
    const video = await facebookGraphClient.get<FacebookLiveVideo>(endpoint, {
      headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
      searchParams: { fields: LIVE_VIDEO_FIELDS },
    })
    return toLiveVideoPost(video)
  })
}

/** Newest broadcasts a state re-read looks through. */
const LIVE_STATE_LOOKBACK = 25

/**
 * Whether a post's broadcast is on, from the Page's newest broadcasts. A
 * broadcast that is not among them, or whose read does not describe a broadcast,
 * is `unknown` (never `ended`): the listing is not an authoritative absence.
 */
export const getLiveState = (props: {
  auth: MessengerAuthValue
  postId: string
}): Promise<ChannelPostLiveState> => {
  const { auth, postId } = props
  const endpoint = `${auth.version ?? DEFAULT_API_VERSION}/${auth.metadata.pageId}/live_videos`
  return rescue(endpoint, async () => {
    const page = await facebookGraphClient.get<{ data: FacebookLiveVideo[] }>(
      endpoint,
      {
        headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
        searchParams: {
          broadcast_status: LIVE_BROADCAST_STATUS_FILTER,
          fields: LIVE_VIDEO_FIELDS,
          limit: String(LIVE_STATE_LOOKBACK),
        },
      },
    )
    const match = page.data
      .map(toLiveVideoPost)
      .find((post) => post?.externalPostId === postId)
    return match?.liveStatus ?? "unknown"
  })
}
