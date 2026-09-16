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
