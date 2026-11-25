import {
  ChannelError,
  ChannelErrorCategory,
  type ChannelPostListItem,
  type ChannelPostListPage,
  clampPageSize,
} from "@chatbotx.io/sdk"
import { rescue, TiktokAPIException } from "../exception"
import { createTiktokBusinessClient } from "../lib/http-client"
import { tiktokCanListVideos } from "../lib/scopes"
import type {
  BusinessApiResponse,
  TiktokAuthValue,
  TiktokVideo,
  TiktokVideoListResult,
} from "../schema"

/**
 * Public video posts on the connected account, newest first, for the comment
 * automation post picker.
 *
 * Note the plural path segment (`videos`, not `video`) and that a post is keyed
 * by `item_id` here while every comment endpoint calls the same id `video_id`.
 *
 * `fields` is required in practice: TikTok returns only the fields asked for,
 * so an omitted list yields entries carrying nothing but `item_id`.
 */
export const listTiktokVideos = (
  accessToken: string,
  params: {
    businessId: string
    fields?: string[]
    cursor?: number
    maxCount?: number
    filters?: { video_ids: string[] }
  },
): Promise<TiktokVideoListResult> =>
  rescue("business/videos/list", async () => {
    const client = createTiktokBusinessClient(accessToken)
    const searchParams: Record<string, string> = {
      business_id: params.businessId,
      fields: JSON.stringify(
        params.fields ?? [
          "item_id",
          "caption",
          "thumbnail_url",
          "share_url",
          "create_time",
          "comments",
        ],
      ),
    }
    if (params.cursor !== undefined) {
      searchParams.cursor = `${params.cursor}`
    }
    if (params.maxCount !== undefined) {
      searchParams.max_count = `${params.maxCount}`
    }
    if (params.filters) {
      searchParams.filters = JSON.stringify(params.filters)
    }

    const response = await client.get<
      BusinessApiResponse<TiktokVideoListResult>
    >("business/videos/list/", { searchParams })

    if (response.code !== 0) {
      throw new TiktokAPIException(
        response.message ?? "business/videos/list failed",
      )
    }
    return response.data ?? {}
  })

/**
 * One owned video by id, or `null` when the account no longer has it.
 *
 * Behind the `video.list` scope. It is approved and requested, but a connection
 * made before the approval does not carry it until its owner re-authorizes, so
 * every caller must treat a rejection as "no details available" rather than an
 * error — a comment conversation has to stay usable without it. The id is
 * re-checked against `item_id` so a backend that ignores `filters` (the
 * parameter is undocumented on this endpoint) yields `null` rather than an
 * unrelated video's caption.
 */
export const findTiktokVideo = async (
  accessToken: string,
  params: { businessId: string; videoId: string },
): Promise<TiktokVideo | null> => {
  const result = await listTiktokVideos(accessToken, {
    businessId: params.businessId,
    filters: { video_ids: [params.videoId] },
    maxCount: 1,
  })
  return (
    result.videos?.find((video) => video.item_id === params.videoId) ?? null
  )
}

/**
 * Videos per page. TikTok's documented page limit was not confirmed, so this
 * stays low: a smaller page only costs more requests, never an error.
 */
const MANAGED_PAGE_SIZE = 20

const NUMERIC_CURSOR = /^\d+$/

// The video list returns the connected user's own public videos; TikTok reports
// no separate creator, so the author stays `null`.
const toManagedPostListItem = (video: TiktokVideo): ChannelPostListItem => ({
  authorExternalId: null,
  authorName: null,
  caption: video.caption ?? null,
  commentsCount: video.comments ?? null,
  contentType: "video",
  externalPostId: video.item_id,
  liveStatus: null,
  mediaType: null,
  permalink: video.share_url ?? null,
  publishedAt: video.create_time ? new Date(video.create_time * 1000) : null,
  // The fields TikTok is asked for carry no like, share or view counts.
  reactionsCount: null,
  sharesCount: null,
  thumbnailUrl: video.thumbnail_url ?? null,
  viewsCount: null,
})

const assertCanListVideos = (auth: TiktokAuthValue): void => {
  if (!tiktokCanListVideos(auth)) {
    // A connection made before `video.list` was approved needs to re-authorize.
    throw new ChannelError(
      "The TikTok connection does not carry the video.list permission",
      ChannelErrorCategory.AUTH_FAILED,
    )
  }
}

/** One page of the account's videos, newest first. */
export const listManagedVideos = async (props: {
  auth: TiktokAuthValue
  cursor?: string
  limit: number
}): Promise<ChannelPostListPage> => {
  const { auth, cursor, limit } = props
  assertCanListVideos(auth)

  if (cursor !== undefined && !NUMERIC_CURSOR.test(cursor)) {
    throw new ChannelError(
      "Invalid TikTok video cursor",
      ChannelErrorCategory.PAYLOAD_INVALID,
    )
  }

  const result = await listTiktokVideos(auth.tokens.accessToken, {
    businessId: auth.metadata.openId,
    cursor: cursor === undefined ? undefined : Number(cursor),
    maxCount: clampPageSize(limit, MANAGED_PAGE_SIZE),
  })

  return {
    items: (result.videos ?? []).map(toManagedPostListItem),
    nextCursor:
      result.has_more && result.cursor !== undefined
        ? String(result.cursor)
        : null,
  }
}

/** One video by id with the listing's fields; throws when the account no longer has it. */
export const getManagedVideo = async (props: {
  auth: TiktokAuthValue
  postId: string
}): Promise<ChannelPostListItem> => {
  const { auth, postId } = props
  assertCanListVideos(auth)

  // The lookup passes an undocumented `filters` parameter. An empty answer
  // proves the filter was applied and the video is not there; a video list
  // without the requested id means the filter was ignored, which says nothing
  // about the video.
  const result = await listTiktokVideos(auth.tokens.accessToken, {
    businessId: auth.metadata.openId,
    filters: { video_ids: [postId] },
    maxCount: 1,
  })
  const videos = result.videos ?? []
  const video = videos.find((candidate) => candidate.item_id === postId)
  if (video) {
    return toManagedPostListItem(video)
  }
  throw new ChannelError(
    videos.length === 0
      ? "The TikTok video was not found"
      : "TikTok ignored the video filter, so the video could not be looked up",
    videos.length === 0
      ? ChannelErrorCategory.NOT_FOUND
      : ChannelErrorCategory.UNKNOWN,
  )
}
