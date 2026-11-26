import {
  type InstagramManagedMedia,
  type InstagramManagedMediaPage,
  MANAGED_MEDIA_FIELDS,
  MAX_MEDIA_PAGE_SIZE,
  toManagedPostListItem,
} from "@chatbotx.io/integration-instagram/apis/post"
import {
  type ChannelPostDetails,
  type ChannelPostListItem,
  type ChannelPostListPage,
  type Context,
  clampPageSize,
} from "@chatbotx.io/sdk"
import { z } from "zod"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { instagramGraphClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type { InstagramAuthValue } from "../schema"
import { listLiveMedia, toLiveMediaListItem } from "./live"

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
 * Lists the connected Instagram Business Account's own media. Unlike the
 * Instagram Login package, a Facebook-Login token cannot use the `me` alias
 * for the IG node, so this addresses the account directly via `igId`.
 */
export const listInstagramMedia = (props: {
  auth: InstagramAuthValue
}): Promise<InstagramMediaListItem[]> => {
  const { auth } = props
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${auth.metadata.igId}/media`

  return rescue(endpoint, async () => {
    const res = await instagramGraphClient.get<
      InstagramPaginatedResponse<InstagramMediaListItem>
    >(endpoint, {
      headers: {
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
      searchParams: {
        fields:
          "id,caption,media_product_type,media_type,media_url,thumbnail_url,timestamp,permalink",
        limit: "100",
      },
    })
    return res.data
  })
}

/**
 * Lists the connected Instagram Business Account's currently active stories.
 * Same `igId`-addressed pattern as `listInstagramMedia` — the `stories` edge
 * is separate from `media` and only ever returns what's currently live
 * (stories expire after ~24h).
 */
export const listInstagramStories = (props: {
  auth: InstagramAuthValue
}): Promise<InstagramMediaListItem[]> => {
  const { auth } = props
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${auth.metadata.igId}/stories`

  return rescue(endpoint, async () => {
    const res = await instagramGraphClient.get<
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
  ctx: Context<InstagramAuthValue>
  input: { postId: string }
}): Promise<InstagramMediaDetails> => {
  const { ctx, input } = props
  const version = ctx.auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${input.postId}`

  return rescue(endpoint, () =>
    instagramGraphClient.get<InstagramMediaDetails>(endpoint, {
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

/**
 * Where a listing is: first the media being broadcast now (`live_media`, the
 * only live source: a past live cannot be listed), then the account's media. A
 * bare string is a media cursor saved before the live pass existed.
 */
const listingCursorSchema = z.object({
  after: z.string().optional(),
  edge: z.enum(["live", "media"]),
})
type ListingCursor = z.infer<typeof listingCursorSchema>

const encodeCursor = (cursor: ListingCursor): string => JSON.stringify(cursor)

const decodeCursor = (raw: string | undefined): ListingCursor => {
  if (!raw) {
    return { edge: "live" }
  }
  try {
    return listingCursorSchema.parse(JSON.parse(raw))
  } catch {
    return { after: raw, edge: "media" }
  }
}

/** One page of the account's media, newest first (stories are a separate edge); the live ones come first. */
export const listManagedMedia = async (props: {
  auth: InstagramAuthValue
  cursor?: string
  limit: number
}): Promise<ChannelPostListPage> => {
  const { auth, cursor, limit } = props
  const position = decodeCursor(cursor)
  if (position.edge === "live") {
    // A token that cannot read `live_media` must not stop the media from
    // syncing: the live pass is skipped.
    try {
      const page = await listLiveMedia({ after: position.after, auth })
      const after = page.paging?.cursors?.after
      return {
        items: page.data.map(toLiveMediaListItem),
        nextCursor: encodeCursor(
          page.paging?.next && after
            ? { after, edge: "live" }
            : { edge: "media" },
        ),
      }
    } catch (err) {
      logger.warn(
        { err },
        "Instagram live_media not readable, listing the media without live broadcasts",
      )
      return { items: [], nextCursor: encodeCursor({ edge: "media" }) }
    }
  }
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${auth.metadata.igId}/media`

  return rescue(endpoint, async () => {
    const searchParams: Record<string, string> = {
      fields: MANAGED_MEDIA_FIELDS,
      limit: String(clampPageSize(limit, MAX_MEDIA_PAGE_SIZE)),
    }
    if (position.after) {
      searchParams.after = position.after
    }
    const page = await instagramGraphClient.get<InstagramManagedMediaPage>(
      endpoint,
      {
        headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
        searchParams,
      },
    )
    const after = page.paging?.cursors?.after
    return {
      items: page.data.map(toManagedPostListItem),
      nextCursor:
        page.paging?.next && after
          ? encodeCursor({ after, edge: "media" })
          : null,
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
      await instagramGraphClient.get<InstagramManagedMedia>(endpoint, {
        headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
        searchParams: { fields: MANAGED_MEDIA_FIELDS },
      }),
    ),
  )
}
