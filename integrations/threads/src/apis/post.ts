import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { threadsGraphClient } from "../lib/http-client"
import type { ThreadsAuthValue } from "../schema"

export type ThreadsPostDetails = {
  id: string
  text?: string
  permalink?: string
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
          "text,permalink,media_url,thumbnail_url,timestamp,username,owner",
        access_token: auth.tokens.accessToken,
      },
    }),
  )
}
