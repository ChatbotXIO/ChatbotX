import type { Context } from "@chatbotx.io/sdk"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { instagramBusinessClient } from "../lib/http-client"
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
 * Lists the authenticated Instagram account's own media. On graph.instagram.com
 * (Instagram Login) the account is addressed via the `me` alias — matching
 * sendInstagramMessage — so this uses `me/media`. Only the first page is
 * returned, mirroring the Messenger `listPublishedPosts` behaviour.
 */
export const listInstagramMedia = (props: {
  auth: InstagramAuthValue
}): Promise<InstagramMediaListItem[]> => {
  const { auth } = props
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/me/media`

  return rescue(endpoint, async () => {
    const res = await instagramBusinessClient.get<
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
 * Lists the authenticated Instagram account's currently active stories (the
 * `stories` edge is separate from `media` — stories never appear there and
 * expire after ~24h, so this only ever returns what's currently live).
 */
export const listInstagramStories = (props: {
  auth: InstagramAuthValue
}): Promise<InstagramMediaListItem[]> => {
  const { auth } = props
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/me/stories`

  return rescue(endpoint, async () => {
    const res = await instagramBusinessClient.get<
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
    instagramBusinessClient.get<InstagramMediaDetails>(endpoint, {
      headers: {
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
      searchParams: {
        fields: "caption,media_url,thumbnail_url,timestamp,permalink",
      },
    }),
  )
}
