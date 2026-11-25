import {
  type ChannelPostContentType,
  type ChannelPostListItem,
  type ChannelPostListPage,
  clampPageSize,
} from "@chatbotx.io/sdk"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { threadsGraphClient } from "../lib/http-client"
import type { ThreadsAuthValue } from "../schema"

export type ThreadsPostDetails = {
  id: string
  text?: string
  permalink?: string
  media_type?: string
  media_url?: string
  thumbnail_url?: string
  timestamp?: string
  username?: string
  owner?: { id: string }
}

export type ThreadsPostListItem = {
  id: string
  text?: string
  media_type?: string
  media_url?: string
  thumbnail_url?: string
  permalink?: string
  timestamp: string
}

type ThreadsPaginatedResponse<T> = {
  data: T[]
}

/**
 * A repost's comments land on the original post, so its own id can never
 * match a webhook `root_post.id` — it is useless as an automation target.
 */
const REPOST_MEDIA_TYPE = "REPOST_FACADE"

/**
 * Lists the authenticated account's most recent Threads posts (one page of
 * up to 100). The ids are the numeric media ids the `replies` webhook sends
 * as `root_post.id` — never the shortcode shown in a post's permalink.
 */
export const listThreadsPosts = (props: {
  auth: ThreadsAuthValue
}): Promise<ThreadsPostListItem[]> => {
  const { auth } = props
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/me/threads`

  return rescue(endpoint, async () => {
    const res = await threadsGraphClient.get<
      ThreadsPaginatedResponse<ThreadsPostListItem>
    >(endpoint, {
      searchParams: {
        fields:
          "id,text,media_type,media_url,thumbnail_url,permalink,timestamp",
        limit: "100",
        access_token: auth.tokens.accessToken,
      },
    })
    return res.data.filter((post) => post.media_type !== REPOST_MEDIA_TYPE)
  })
}

export const getPostDetails = (
  auth: ThreadsAuthValue,
  postId: string,
): Promise<ThreadsPostDetails> => {
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${postId}`

  return rescue(endpoint, () =>
    threadsGraphClient.get<ThreadsPostDetails>(endpoint, {
      searchParams: {
        fields:
          "text,permalink,media_type,media_url,thumbnail_url,timestamp,username,owner",
        access_token: auth.tokens.accessToken,
      },
    }),
  )
}

/** Most posts one Threads page returns. */
const MAX_PAGE_SIZE = 100

const MANAGED_POST_FIELDS =
  "id,text,media_type,media_url,thumbnail_url,permalink,timestamp"

/** The `media_type` values Threads documents, mapped to the neutral kind. */
const CONTENT_TYPE_BY_MEDIA_TYPE: Record<string, ChannelPostContentType> = {
  AUDIO: "audio",
  CAROUSEL_ALBUM: "carousel",
  IMAGE: "photo",
  TEXT_POST: "text",
  VIDEO: "video",
}

export type ThreadsManagedPost = ThreadsPostListItem

type ThreadsManagedPage = {
  data: ThreadsManagedPost[]
  paging?: { cursors?: { after?: string } }
}

/**
 * Maps a Threads post into the neutral listing item. The listing carries no
 * counts (they need one Insights call per post), so they stay `null`. Every
 * post of `/me/threads` belongs to the connected account itself (its
 * `username` is that account), and Threads reports no separate creator, so the
 * author stays `null`.
 */
export const toManagedPostListItem = (
  post: ThreadsManagedPost,
): ChannelPostListItem => ({
  authorExternalId: null,
  authorName: null,
  caption: post.text ?? null,
  commentsCount: null,
  contentType: CONTENT_TYPE_BY_MEDIA_TYPE[post.media_type ?? ""] ?? "other",
  externalPostId: post.id,
  liveStatus: null,
  mediaType: post.media_type ?? null,
  permalink: post.permalink ?? null,
  publishedAt: post.timestamp ? new Date(post.timestamp) : null,
  reactionsCount: null,
  sharesCount: null,
  thumbnailUrl: post.thumbnail_url ?? post.media_url ?? null,
  viewsCount: null,
})

/**
 * One page of the account's posts, newest first. Threads documents only the
 * `after` cursor on the page, so a page that returned posts and an `after`
 * hands it on: the last page is the first one that comes back empty.
 */
export const listManagedPosts = (props: {
  auth: ThreadsAuthValue
  cursor?: string
  limit: number
}): Promise<ChannelPostListPage> => {
  const { auth, cursor, limit } = props
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/me/threads`

  return rescue(endpoint, async () => {
    const searchParams: Record<string, string> = {
      fields: MANAGED_POST_FIELDS,
      limit: String(clampPageSize(limit, MAX_PAGE_SIZE)),
      access_token: auth.tokens.accessToken,
    }
    if (cursor) {
      searchParams.after = cursor
    }
    const page = await threadsGraphClient.get<ThreadsManagedPage>(endpoint, {
      searchParams,
    })
    const after = page.paging?.cursors?.after
    return {
      // A repost's own id never matches a comment event: leave it out.
      items: page.data
        .filter((post) => post.media_type !== REPOST_MEDIA_TYPE)
        .map(toManagedPostListItem),
      // A cursor that did not move would repeat the same page forever.
      nextCursor:
        page.data.length > 0 && after && after !== cursor ? after : null,
    }
  })
}

/** One post by id with the listing's fields, so a refresh matches a sync. */
export const getManagedPost = (props: {
  auth: ThreadsAuthValue
  postId: string
}): Promise<ChannelPostListItem> => {
  const { auth, postId } = props
  const endpoint = `${auth.metadata.version ?? DEFAULT_API_VERSION}/${postId}`

  return rescue(endpoint, async () =>
    toManagedPostListItem(
      await threadsGraphClient.get<ThreadsManagedPost>(endpoint, {
        searchParams: {
          fields: MANAGED_POST_FIELDS,
          access_token: auth.tokens.accessToken,
        },
      }),
    ),
  )
}
