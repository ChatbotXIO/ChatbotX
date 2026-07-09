import type { Context } from "@chatbotx.io/sdk"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
import type { MessengerAuthValue } from "../schema"

export type FacebookPostDetails = {
  message?: string
  full_picture?: string
  from?: { id: string; name: string }
  created_time: string
}

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
        description?: string
        picture?: string
        created_time: string
        permalink_url?: string
      }>
    >(endpoint, {
      headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
      searchParams: {
        fields: "id,description,picture,created_time,permalink_url",
        limit: "100",
      },
    })
    return res.data.map((item) => ({
      id: item.id,
      message: item.description,
      full_picture: item.picture,
      created_time: item.created_time,
      permalink_url: item.permalink_url,
    }))
  })
}

export const getPostDetails = (props: {
  ctx: Context<MessengerAuthValue>
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
        fields: "message,full_picture,from,created_time",
      },
    }),
  )
}
