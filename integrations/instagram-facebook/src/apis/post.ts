import type { Context } from "@chatbotx.io/sdk"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { instagramGraphClient } from "../lib/http-client"
import type { InstagramAuthValue } from "../schemas"

export type InstagramMediaDetails = {
  caption?: string
  media_url?: string
  thumbnail_url?: string
  timestamp: string
  permalink?: string
}

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
 * for the IG node, so this addresses the account directly via `igId` —
 * matching this package's own `likeComment` (`${igId}/likes`).
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
        fields: "caption,media_url,thumbnail_url,timestamp,permalink",
      },
    }),
  )
}
