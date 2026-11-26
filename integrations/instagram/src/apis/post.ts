import {
  type ChannelError,
  ChannelErrorCategory,
  type ChannelPostContentType,
  type ChannelPostDetails,
  type ChannelPostListItem,
  type ChannelPostListPage,
  type ChannelPostMetricsItem,
  type Context,
  clampPageSize,
  isRateLimited,
} from "@chatbotx.io/sdk"
import { DEFAULT_API_VERSION } from "../constants"
import {
  InstagramAPIException,
  isUnsupportedFieldError,
  rescue,
} from "../exception"
import {
  getInstagramAccountNode,
  getInstagramGraphClient,
} from "../lib/http-client"
import type { InstagramAuthValue } from "../schema"

export type InstagramMediaDetails = {
  caption?: string
  media_type?: string
  media_url?: string
  thumbnail_url?: string
  timestamp: string
  permalink?: string
}

/** Maps the Graph media node into the channel-neutral post description. */
export const toChannelPostDetails = (
  media: InstagramMediaDetails,
): ChannelPostDetails => ({
  caption: media.caption,
  mediaType: media.media_type,
  permalink: media.permalink,
  publishedAt: media.timestamp ? new Date(media.timestamp) : null,
  thumbnailUrl: media.thumbnail_url ?? media.media_url,
})

export type InstagramMediaListItem = {
  id: string
  caption?: string
  media_type?: string
  media_product_type?: string
  media_url?: string
  thumbnail_url?: string
  timestamp: string
  permalink?: string
}

type InstagramPaginatedResponse<T> = {
  data: T[]
}

/**
 * Lists the authenticated Instagram account's own media. On graph.instagram.com
 * (Instagram Login) the account is addressed via the `me` alias — matching
 * `sendMessage` (`apis/message.ts`) — so this uses `me/media`. Only the first page is
 * returned, mirroring the Messenger `listPublishedPosts` behaviour.
 */
export const listInstagramMedia = (props: {
  auth: InstagramAuthValue
}): Promise<InstagramMediaListItem[]> => {
  const { auth } = props
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${getInstagramAccountNode(auth)}/media`

  return rescue(endpoint, async () => {
    const res = await getWithFieldFallback(
      "id,caption,media_product_type,media_type,media_url,thumbnail_url,timestamp,permalink",
      (fields) =>
        getInstagramGraphClient(auth).get<
          InstagramPaginatedResponse<InstagramMediaListItem>
        >(endpoint, {
          headers: {
            Authorization: `Bearer ${auth.tokens.accessToken}`,
          },
          searchParams: { fields, limit: "100" },
        }),
    )
    return res.data
  })
}

/**
 * Lists the authenticated Instagram account's currently active stories (the
 * `stories` edge is separate from `media` — stories never appear there and
 * expire after ~24h, so this only ever returns what's currently live).
 */
export const listInstagramStories = (props: {
  auth: InstagramAuthValue
}): Promise<InstagramMediaListItem[]> => {
  const { auth } = props
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${getInstagramAccountNode(auth)}/stories`

  return rescue(endpoint, async () => {
    const res = await getInstagramGraphClient(auth).get<
      InstagramPaginatedResponse<InstagramMediaListItem>
    >(endpoint, {
      headers: {
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
      searchParams: {
        fields:
          "id,caption,media_type,media_url,thumbnail_url,timestamp,permalink",
        limit: "100",
      },
    })
    return res.data
  })
}

export const getPostDetails = (props: {
  ctx: Pick<Context<InstagramAuthValue>, "auth">
  input: { postId: string }
}): Promise<InstagramMediaDetails> => {
  const { ctx, input } = props
  const version = ctx.auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${input.postId}`

  return rescue(endpoint, () =>
    getInstagramGraphClient(ctx.auth).get<InstagramMediaDetails>(endpoint, {
      headers: {
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
      searchParams: {
        fields:
          "caption,media_type,media_url,thumbnail_url,timestamp,permalink",
      },
    }),
  )
}

const PRODUCT_TYPE_FIELD = "media_product_type"
const REEL_PERMALINK_SEGMENT = "/reel/"

const withoutProductType = (fields: string): string =>
  fields
    .split(",")
    .filter((field) => field !== PRODUCT_TYPE_FIELD)
    .join(",")

/**
 * `media_product_type` is documented for Instagram API with Facebook Login only
 * (https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media),
 * so on Instagram Login a Graph error 100 retries the same request without it.
 */
const getWithFieldFallback = async <T>(
  fields: string,
  call: (fields: string) => Promise<T>,
): Promise<T> => {
  try {
    return await call(fields)
  } catch (error) {
    if (
      error instanceof InstagramAPIException &&
      isUnsupportedFieldError(error) &&
      fields.includes(PRODUCT_TYPE_FIELD)
    ) {
      return await call(withoutProductType(fields))
    }
    throw error
  }
}

/** Most media one Graph page returns. */
export const MAX_MEDIA_PAGE_SIZE = 100

export const MANAGED_MEDIA_FIELDS =
  "id,caption,media_product_type,media_type,media_url,thumbnail_url,timestamp,permalink,comments_count,like_count"

export type InstagramManagedMedia = InstagramMediaListItem & {
  /** Omitted when the owner turned comments off. */
  comments_count?: number
  /** Omitted when the owner hid like counts. */
  like_count?: number
}

export type InstagramManagedMediaPage = {
  data: InstagramManagedMedia[]
  paging?: { cursors?: { after?: string }; next?: string }
}

const CONTENT_TYPE_BY_PRODUCT: Record<string, ChannelPostContentType> = {
  REELS: "reel",
  STORY: "story",
}

const CONTENT_TYPE_BY_MEDIA_TYPE: Record<string, ChannelPostContentType> = {
  CAROUSEL_ALBUM: "carousel",
  IMAGE: "photo",
  VIDEO: "video",
}

/**
 * The neutral kind of an Instagram media object. Both Instagram logins return
 * the same `media_product_type` (the surface: Feed, Reels, Story) and
 * `media_type` (the file kind): the surface wins for Reels and Stories, the
 * file kind decides for the rest.
 */
const instagramContentType = (media: {
  media_product_type?: string
  media_type?: string
  permalink?: string
}): ChannelPostContentType => {
  const bySurface = CONTENT_TYPE_BY_PRODUCT[media.media_product_type ?? ""]
  if (bySurface) {
    return bySurface
  }
  // Without the surface (Instagram Login does not return it) a video whose
  // permalink is a reel link is a Reel. NOT documented: the permalink shape is
  // an observed convention, so a wrong guess only mislabels a video as a reel.
  if (
    media.media_product_type === undefined &&
    media.media_type === "VIDEO" &&
    media.permalink?.includes(REEL_PERMALINK_SEGMENT)
  ) {
    return "reel"
  }
  return CONTENT_TYPE_BY_MEDIA_TYPE[media.media_type ?? ""] ?? "other"
}

/**
 * Maps an Instagram media node into the neutral listing item. A count the
 * platform leaves out is `null` (unknown), never zero. The media's `owner` /
 * `username` is the connected account itself, not a separate creator, so the
 * author stays `null`.
 */
export const toManagedPostListItem = (
  media: InstagramManagedMedia,
): ChannelPostListItem => ({
  authorExternalId: null,
  authorName: null,
  caption: media.caption ?? null,
  commentsCount: media.comments_count ?? null,
  contentType: instagramContentType(media),
  externalPostId: media.id,
  liveStatus: null,
  mediaType: media.media_product_type ?? media.media_type ?? null,
  permalink: media.permalink ?? null,
  publishedAt: media.timestamp ? new Date(media.timestamp) : null,
  reactionsCount: media.like_count ?? null,
  sharesCount: null,
  thumbnailUrl: media.thumbnail_url ?? media.media_url ?? null,
  viewsCount: null,
})

/** One page of the account's media, newest first (stories are a separate edge). */
export const listManagedMedia = (props: {
  auth: InstagramAuthValue
  cursor?: string
  limit: number
}): Promise<ChannelPostListPage> => {
  const { auth, cursor, limit } = props
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${getInstagramAccountNode(auth)}/media`

  return rescue(endpoint, async () => {
    const page = await getWithFieldFallback(MANAGED_MEDIA_FIELDS, (fields) => {
      const searchParams: Record<string, string> = {
        fields,
        limit: String(clampPageSize(limit, MAX_MEDIA_PAGE_SIZE)),
      }
      if (cursor) {
        searchParams.after = cursor
      }
      return getInstagramGraphClient(auth).get<InstagramManagedMediaPage>(
        endpoint,
        {
          headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
          searchParams,
        },
      )
    })
    const after = page.paging?.cursors?.after
    return {
      items: page.data.map(toManagedPostListItem),
      nextCursor: page.paging?.next && after ? after : null,
    }
  })
}

/** One media object by id with the listing's fields, so a refresh matches a sync. */
export const getManagedMedia = (props: {
  auth: InstagramAuthValue
  postId: string
}): Promise<ChannelPostListItem> => {
  const { auth, postId } = props
  const endpoint = `${auth.metadata.version ?? DEFAULT_API_VERSION}/${postId}`

  return rescue(endpoint, async () =>
    toManagedPostListItem(
      await getWithFieldFallback(MANAGED_MEDIA_FIELDS, (fields) =>
        getInstagramGraphClient(auth).get<InstagramManagedMedia>(endpoint, {
          headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
          searchParams: { fields },
        }),
      ),
    ),
  )
}

/** Failures that affect the whole account, so reading the next post would fail the same way. */
const ACCOUNT_WIDE_CATEGORIES: ReadonlySet<string> = new Set([
  ChannelErrorCategory.AUTH_FAILED,
  ChannelErrorCategory.RATE_LIMITED,
  ChannelErrorCategory.QUOTA_EXCEEDED,
])

/**
 * The counts of a batch of media, read one by one with `readOne` (the single
 * media read the listing's fields come from), in order and bounded by the
 * caller's batch size. Instagram has no documented batch read of media counts,
 * so this is the bounded fallback. A media that cannot be read for its own
 * sake (gone, hidden — Graph answers those with a permission-style error too)
 * is left out, so its stored counts stay; an account-wide failure (auth, rate
 * limit) stops the batch and is thrown. Permission errors only stop it when
 * nothing has been read yet and {@link PERMISSION_FAILURES_BEFORE_STOP} came in
 * a row, which is what an account really missing the permission looks like.
 */
/** Permission errors in a row, before any media was read, that end the batch. */
const PERMISSION_FAILURES_BEFORE_STOP = 3

export const collectMediaMetrics = async (props: {
  postIds: string[]
  readOne: (postId: string) => Promise<ChannelPostListItem>
  /**
   * The connector's own error mapper (`mapToChannelError`): the read throws
   * the connector's exception, not a `ChannelError`, so it is classified here
   * before deciding whether to go on.
   */
  toChannelError: (error: unknown) => ChannelError
}): Promise<ChannelPostMetricsItem[]> => {
  const items: ChannelPostMetricsItem[] = []
  let permissionFailures = 0
  for (const postId of props.postIds) {
    try {
      const media = await props.readOne(postId)
      items.push({
        commentsCount: media.commentsCount,
        externalPostId: media.externalPostId,
        reactionsCount: media.reactionsCount,
        sharesCount: media.sharesCount,
        viewsCount: media.viewsCount,
      })
    } catch (err) {
      const channelError = props.toChannelError(err)
      // A rate limit can come as a reason only (e.g. code 80002, category UNKNOWN).
      if (
        ACCOUNT_WIDE_CATEGORIES.has(channelError.category) ||
        isRateLimited(channelError)
      ) {
        throw channelError
      }
      if (channelError.category !== ChannelErrorCategory.PERMISSION_DENIED) {
        permissionFailures = 0
        continue
      }
      permissionFailures += 1
      if (
        items.length === 0 &&
        permissionFailures >= PERMISSION_FAILURES_BEFORE_STOP
      ) {
        throw channelError
      }
    }
  }
  return items
}
