import {
  ChannelError,
  ChannelErrorCategory,
  type ChannelPostDetails,
  type ChannelPostListItem,
  type ChannelPostListPage,
  type ChannelPostMetricsItem,
  type Context,
  clampPageSize,
  isRateLimited,
} from "@chatbotx.io/sdk"
import type { ChannelPostContentType } from "@chatbotx.io/utils/channel-post"
import { z } from "zod"
import { DEFAULT_API_VERSION } from "../constants"
import { MessengerException, rescue } from "../exception"
import { mapToChannelError } from "../lib/error-mapper"
import { facebookGraphClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type { MessengerAuthValue } from "../schema"
import { sendGraphBatch } from "./batch"
import {
  type FacebookLiveVideo,
  LIVE_BROADCAST_STATUS_FILTER,
  LIVE_VIDEO_FIELDS,
  toLiveListItem,
} from "./live-video"

export type FacebookPostDetails = {
  message?: string
  full_picture?: string
  from?: { id: string; name: string }
  created_time: string
  permalink_url?: string
}

/** Maps the Graph post node into the channel-neutral post description. */
export const toChannelPostDetails = (
  post: FacebookPostDetails,
): ChannelPostDetails => ({
  caption: post.message,
  permalink: post.permalink_url,
  publishedAt: post.created_time ? new Date(post.created_time) : null,
  thumbnailUrl: post.full_picture,
})

export type FacebookPostListItem = {
  id: string
  message?: string
  full_picture?: string
  created_time: string
  permalink_url?: string
}

type FacebookPaginatedResponse<T> = {
  data: T[]
}

export const listPublishedPosts = (props: {
  auth: MessengerAuthValue
  pageId: string
}): Promise<FacebookPostListItem[]> => {
  const { auth, pageId } = props
  const version = auth.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${pageId}/posts`

  return rescue(endpoint, async () => {
    const res = await facebookGraphClient.get<
      FacebookPaginatedResponse<FacebookPostListItem>
    >(endpoint, {
      headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
      searchParams: {
        fields: "id,message,full_picture,created_time,permalink_url",
        limit: "100",
      },
    })
    return res.data
  })
}

export const listAdsPosts = (props: {
  auth: MessengerAuthValue
  pageId: string
}): Promise<FacebookPostListItem[]> => {
  const { auth, pageId } = props
  const version = auth.version ?? DEFAULT_API_VERSION
  // The `promotable_posts` edge is deprecated by Meta. Published, ad-eligible
  // posts now come from `/feed` filtered by `is_eligible_for_promotion`.
  const endpoint = `${version}/${pageId}/feed`

  return rescue(endpoint, async () => {
    const res = await facebookGraphClient.get<
      FacebookPaginatedResponse<
        FacebookPostListItem & { is_eligible_for_promotion?: boolean }
      >
    >(endpoint, {
      headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
      searchParams: {
        fields:
          "id,message,full_picture,created_time,permalink_url,is_eligible_for_promotion",
        limit: "100",
      },
    })
    return res.data.filter((post) => post.is_eligible_for_promotion === true)
  })
}

export const listReelsPosts = (props: {
  auth: MessengerAuthValue
  pageId: string
}): Promise<FacebookPostListItem[]> => {
  const { auth, pageId } = props
  const version = auth.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${pageId}/video_reels`

  return rescue(endpoint, async () => {
    const res = await facebookGraphClient.get<
      FacebookPaginatedResponse<{
        id: string
        post_id?: string
        description?: string
        picture?: string
        created_time: string
        permalink_url?: string
      }>
    >(endpoint, {
      headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
      searchParams: {
        fields: "id,post_id,description,picture,created_time,permalink_url",
        limit: "100",
      },
    })
    // A reel's video id is not the id of the post it lives in, and the `feed`
    // webhook reports comments by that post id. Store the post id so a
    // reel-scoped automation matches its comments; the video id is only a
    // fallback for a reel Facebook returns without one.
    return res.data.map((item) => ({
      id: item.post_id ?? item.id,
      message: item.description,
      full_picture: item.picture,
      created_time: item.created_time,
      permalink_url: item.permalink_url,
    }))
  })
}

export const getPostDetails = (props: {
  ctx: Pick<Context<MessengerAuthValue>, "auth">
  input: { postId: string }
}): Promise<FacebookPostDetails> => {
  const { ctx, input } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const endpoint = `${version}/${input.postId}`

  return rescue(endpoint, () =>
    facebookGraphClient.get<FacebookPostDetails>(endpoint, {
      headers: {
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
      searchParams: {
        fields: "message,full_picture,from,created_time,permalink_url",
      },
    }),
  )
}

/** Most posts one Graph page returns; the Page edges reject a larger `limit`. */
const MAX_PAGE_SIZE = 100

/**
 * The Page's own posts (`/posts`, not `/feed`, which also returns visitors'
 * posts and posts that only tag the Page) do not include Reels, which live on
 * their own edge. A listing reads the Reels first (a far smaller edge, so a
 * long post history that hits the sync's cap can never starve them) and then
 * the posts, so the cursor remembers which edge it is on.
 */
const postEdges = z.enum(["posts", "reels", "live"])
type PostEdge = z.infer<typeof postEdges>
const postCursorSchema = z.object({
  after: z.string().optional(),
  edge: postEdges,
})
type PostCursor = z.infer<typeof postCursorSchema>

/**
 * `admin_creator` is the admin who created a Page post. Facebook documents it
 * as available only when the Page has more than one admin, and null for a
 * regular post, so a missing creator is the common case, not a failure.
 */
const adminCreatorSchema = z
  .object({ id: z.string().min(1), name: z.string().min(1).optional() })
  .nullish()
  .catch(null)

type FacebookAdminCreator = z.infer<typeof adminCreatorSchema>

const ADMIN_CREATOR_FIELD = "admin_creator{id,name}"

/**
 * Graph errors that mean "this token cannot read a requested field" (100
 * invalid parameter, 200 permissions error, 283 requires extended
 * permissions). Only these are retried without `admin_creator`; any other
 * error, and a repeat of these, propagates.
 */
const FIELD_UNREADABLE_CODES: ReadonlySet<number> = new Set([100, 200, 283])

const isFieldUnreadableError = (error: unknown): boolean =>
  error instanceof MessengerException &&
  FIELD_UNREADABLE_CODES.has(Number(error.code))

/**
 * Runs `read` with the creator field; when the token cannot read it, runs the
 * same request once more without it, so a page of posts is never lost (and the
 * sync cursor never stalls) over a field that only adds an author.
 */
const readWithAdminCreator = async <T>(
  read: (fields: { withCreator: boolean }) => Promise<T>,
): Promise<T> => {
  try {
    return await read({ withCreator: true })
  } catch (error) {
    if (!isFieldUnreadableError(error)) {
      throw error
    }
    logger.warn(
      { err: error },
      "Facebook admin_creator not readable, listing posts without it",
    )
    return await read({ withCreator: false })
  }
}

/**
 * `filter(stream)` makes the summary count comments at every level. Graph's
 * default `filter` is `toplevel`, which leaves the replies out
 * (https://developers.facebook.com/docs/graph-api/reference/object/comments:
 * `toplevel` "is the default"; `stream` is "comments at all levels in
 * chronological order").
 */
const COMMENTS_COUNT_FIELD = "comments.limit(0).summary(true).filter(stream)"
const REACTIONS_COUNT_FIELD = "reactions.limit(0).summary(true)"

const POST_FIELDS = [
  "id",
  "message",
  "full_picture",
  "created_time",
  "permalink_url",
  "status_type",
  "is_published",
  "shares",
  COMMENTS_COUNT_FIELD,
  REACTIONS_COUNT_FIELD,
]

const postFields = (withCreator: boolean): string =>
  (withCreator ? [...POST_FIELDS, ADMIN_CREATOR_FIELD] : POST_FIELDS).join(",")

const REEL_FIELDS = "id,post_id,description,picture,created_time,permalink_url"

type FacebookSummaryEdge = { summary?: { total_count?: number } }

export type FacebookFeedPost = FacebookPostListItem & {
  admin_creator?: unknown
  comments?: FacebookSummaryEdge
  is_published?: boolean
  reactions?: FacebookSummaryEdge
  shares?: { count?: number }
  status_type?: string
}

type FacebookReel = {
  created_time: string
  description?: string
  id: string
  permalink_url?: string
  picture?: string
  post_id?: string
}

type FacebookPage<Item> = {
  data: Item[]
  paging?: { cursors?: { after?: string }; next?: string }
}

/** The `status_type` values the Page feed documents, mapped to the neutral kind. */
const CONTENT_TYPE_BY_STATUS_TYPE: Record<string, ChannelPostContentType> = {
  added_photos: "photo",
  added_video: "video",
  // The remaining documented values describe an event, not a content shape.
  app_created_story: "other",
  approved_friend: "other",
  created_event: "other",
  created_group: "other",
  created_note: "other",
  mobile_status_update: "text",
  published_story: "text",
  shared_story: "link",
  tagged_in_photo: "other",
  wall_post: "text",
}

/** The neutral kind of a Page post from its `status_type`; `other` for a value that describes an event or is missing. */
const contentTypeOfStatusType = (
  statusType: string | undefined,
): ChannelPostContentType =>
  CONTENT_TYPE_BY_STATUS_TYPE[statusType ?? ""] ?? "other"

const publishedAt = (createdTime: string): Date | null =>
  createdTime ? new Date(createdTime) : null

export const toFeedPostListItem = (
  post: FacebookFeedPost,
): ChannelPostListItem => {
  const creator: FacebookAdminCreator = adminCreatorSchema.parse(
    post.admin_creator,
  )
  return {
    authorExternalId: creator?.id ?? null,
    authorName: creator?.name ?? null,
    caption: post.message ?? null,
    commentsCount: post.comments?.summary?.total_count ?? null,
    contentType: contentTypeOfStatusType(post.status_type),
    externalPostId: post.id,
    liveStatus: null,
    mediaType: post.status_type ?? null,
    permalink: post.permalink_url ?? null,
    publishedAt: publishedAt(post.created_time),
    reactionsCount: post.reactions?.summary?.total_count ?? null,
    // Observed Graph behaviour, not documented: `shares` is left out of a post
    // nobody shared.
    sharesCount: post.shares?.count ?? 0,
    thumbnailUrl: post.full_picture ?? null,
    viewsCount: null,
  }
}

/**
 * A reel is addressed by its post id: the `feed` webhook reports a reel's
 * comments by that id, never by the video id. The listing carries no counts.
 */
export const toReelListItem = (reel: FacebookReel): ChannelPostListItem => ({
  authorExternalId: null,
  authorName: null,
  caption: reel.description ?? null,
  commentsCount: null,
  contentType: "reel",
  externalPostId: reel.post_id ?? reel.id,
  liveStatus: null,
  mediaType: "reel",
  permalink: reel.permalink_url ?? null,
  publishedAt: publishedAt(reel.created_time),
  reactionsCount: null,
  sharesCount: null,
  thumbnailUrl: reel.picture ?? null,
  viewsCount: null,
})

const POST_EDGE_PATH: Record<PostEdge, string> = {
  live: "live_videos",
  posts: "posts",
  reels: "video_reels",
}

const encodeCursor = (cursor: PostCursor): string => JSON.stringify(cursor)

// A saved cursor this code cannot read (its format changed) is the one failure
// the sync may recover from by starting the listing over, so it is reported as
// the channel's `PAYLOAD_INVALID`, not as a bare parse error.
const decodeCursor = (raw: string | undefined): PostCursor => {
  if (!raw) {
    return { edge: "reels" }
  }
  try {
    return postCursorSchema.parse(JSON.parse(raw))
  } catch {
    throw new ChannelError(
      "Invalid Facebook post cursor",
      ChannelErrorCategory.PAYLOAD_INVALID,
    )
  }
}

const nextCursor = (
  edge: PostEdge,
  paging: FacebookPage<unknown>["paging"],
): PostCursor | null => {
  const after = paging?.cursors?.after
  if (paging?.next && after) {
    return { after, edge }
  }
  // The Reels, then the live broadcasts, are read to their end before the posts
  // edge starts.
  if (edge === "reels") {
    return { edge: "live" }
  }
  return edge === "live" ? { edge: "posts" } : null
}

/**
 * One page of the Page's posts: the Reels first, then the live broadcasts, then
 * the feed.
 * Scheduled (unpublished) posts the feed also returns are left out.
 */
export const listPagePosts = async (props: {
  auth: MessengerAuthValue
  cursor?: string
  limit: number
}): Promise<ChannelPostListPage> => {
  const { auth, limit } = props
  const { edge, after } = decodeCursor(props.cursor)
  const version = auth.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${auth.metadata.pageId}/${POST_EDGE_PATH[edge]}`

  return await rescue(endpoint, async () => {
    const searchParamsFor = (fields: string): Record<string, string> => ({
      fields,
      limit: String(clampPageSize(limit, MAX_PAGE_SIZE)),
      ...(after ? { after } : {}),
    })
    const headers = { Authorization: `Bearer ${auth.tokens.accessToken}` }

    if (edge === "posts") {
      const page = await readWithAdminCreator(({ withCreator }) =>
        facebookGraphClient.get<FacebookPage<FacebookFeedPost>>(endpoint, {
          headers,
          searchParams: searchParamsFor(postFields(withCreator)),
        }),
      )
      const next = nextCursor("posts", page.paging)
      return {
        items: page.data
          .filter((post) => post.is_published !== false)
          .map(toFeedPostListItem),
        nextCursor: next ? encodeCursor(next) : null,
      }
    }
    if (edge === "live") {
      // Every broadcast the Page has, on the air and past, minus the scheduled and
      // unpublished ones (`broadcast_status`, documented on the edge).
      // A token that cannot read the edge must not stop the feed from syncing:
      // the live pass is skipped and the listing goes on to the posts.
      try {
        const page = await facebookGraphClient.get<
          FacebookPage<FacebookLiveVideo>
        >(endpoint, {
          headers,
          searchParams: {
            ...searchParamsFor(LIVE_VIDEO_FIELDS),
            broadcast_status: LIVE_BROADCAST_STATUS_FILTER,
          },
        })
        const next = nextCursor("live", page.paging)
        return {
          items: page.data.flatMap((video) => toLiveListItem(video) ?? []),
          nextCursor: next ? encodeCursor(next) : null,
        }
      } catch (err) {
        logger.warn(
          { err },
          "Facebook live_videos not readable, listing the posts without live broadcasts",
        )
        return { items: [], nextCursor: encodeCursor({ edge: "posts" }) }
      }
    }
    const page = await facebookGraphClient.get<FacebookPage<FacebookReel>>(
      endpoint,
      { headers, searchParams: searchParamsFor(REEL_FIELDS) },
    )
    const next = nextCursor("reels", page.paging)
    return {
      items: page.data.map(toReelListItem),
      nextCursor: next ? encodeCursor(next) : null,
    }
  })
}

/** One feed post by id with the listing's fields, so a refresh matches a sync. */
export const getManagedPost = (props: {
  auth: MessengerAuthValue
  postId: string
}): Promise<ChannelPostListItem> => {
  const { auth, postId } = props
  const endpoint = `${auth.version ?? DEFAULT_API_VERSION}/${postId}`

  return rescue(endpoint, async () =>
    toFeedPostListItem(
      await readWithAdminCreator(({ withCreator }) =>
        facebookGraphClient.get<FacebookFeedPost>(endpoint, {
          headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
          searchParams: { fields: postFields(withCreator) },
        }),
      ),
    ),
  )
}

/** The count fields of a post, the same ones the listing reads. */
const METRICS_FIELDS = [
  "id",
  "shares",
  COMMENTS_COUNT_FIELD,
  REACTIONS_COUNT_FIELD,
].join(",")

const metricsNodeSchema = z.object({
  comments: z
    .object({ summary: z.object({ total_count: z.number() }).partial() })
    .partial()
    .optional(),
  id: z.string(),
  reactions: z
    .object({ summary: z.object({ total_count: z.number() }).partial() })
    .partial()
    .optional(),
  shares: z.object({ count: z.number() }).partial().optional(),
})

/** The error categories that end the whole batch: every sub-request shares the Page token. */
const ACCOUNT_WIDE_CATEGORIES: ReadonlySet<string> = new Set([
  ChannelErrorCategory.AUTH_FAILED,
  ChannelErrorCategory.RATE_LIMITED,
  ChannelErrorCategory.QUOTA_EXCEEDED,
])

/**
 * The counts of up to 50 feed posts in ONE Graph call: a Graph batch of
 * `GET <id>?fields=...` sub-requests. (Graph's multiple-ID read, `?ids=a,b`,
 * is not used: Meta dropped it in Graph API v26.0 and no new app may use it,
 * see https://developers.facebook.com/blog/post/2026/11/04/introducing-graph-api-v27-and-marketing-api-v27/ .)
 * A sub-request that failed for its own post (gone, hidden) or timed out is
 * left out, so its stored counts are never changed. An account-wide failure
 * (auth, rate limit) is thrown. A permission error is per post: Graph answers
 * a deleted or unreadable post with code 10 ("Object does not exist, cannot be
 * loaded due to missing permission ..."), so it is thrown only when no post of
 * the batch could be read, which is what a Page really missing the permission
 * looks like.
 */
export const getPostsMetrics = async (props: {
  auth: MessengerAuthValue
  postIds: string[]
}): Promise<ChannelPostMetricsItem[]> => {
  const { auth, postIds } = props
  const { results } = await sendGraphBatch(
    auth,
    postIds.map((postId) => ({
      method: "GET" as const,
      relativeUrl: `${encodeURIComponent(postId)}?fields=${METRICS_FIELDS}`,
    })),
  )
  const items: ChannelPostMetricsItem[] = []
  let permissionError: ChannelError | null = null
  for (const result of results) {
    if (result.kind === "unknown") {
      continue
    }
    if (result.kind === "error") {
      const error = mapToChannelError({
        errorBody: result.errorBody,
        httpStatus: result.httpStatus,
      })
      if (ACCOUNT_WIDE_CATEGORIES.has(error.category) || isRateLimited(error)) {
        throw error
      }
      if (error.category === ChannelErrorCategory.PERMISSION_DENIED) {
        permissionError = error
      }
      continue
    }
    const node = metricsNodeSchema.safeParse(result.body)
    if (node.success) {
      items.push(toMetricsItem(node.data))
    }
  }
  if (items.length === 0 && permissionError) {
    throw permissionError
  }
  return items
}

const toMetricsItem = (
  node: z.infer<typeof metricsNodeSchema>,
): ChannelPostMetricsItem => ({
  commentsCount: node.comments?.summary?.total_count ?? null,
  externalPostId: node.id,
  reactionsCount: node.reactions?.summary?.total_count ?? null,
  // Same rule as the listing: `shares` is left out of a post nobody shared.
  sharesCount: node.shares?.count ?? 0,
  viewsCount: null,
})
