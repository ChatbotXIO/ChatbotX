import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { instagramGraphClient } from "../lib/http-client"
import type { InstagramAuthValue } from "../schemas"

export const sendComment = (
  auth: InstagramAuthValue,
  commentId: string,
  message: string | null,
): Promise<{ id: string }> => {
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${commentId}/replies`

  return rescue(endpoint, () =>
    instagramGraphClient.post<{ id: string }>(endpoint, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
      json: { message },
      retry: 0,
    }),
  )
}

export const deleteComment = (
  auth: InstagramAuthValue,
  commentId: string,
): Promise<{ success: boolean }> => {
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${commentId}`

  return rescue(endpoint, () =>
    instagramGraphClient.delete<{ success: boolean }>(endpoint, {
      headers: {
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
    }),
  )
}

export const hideComment = (
  auth: InstagramAuthValue,
  commentId: string,
  hidden: boolean,
): Promise<{ success: boolean }> => {
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${commentId}`

  return rescue(endpoint, () =>
    instagramGraphClient.post<{ success: boolean }>(endpoint, {
      headers: {
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
      searchParams: { hide: String(hidden) },
    }),
  )
}

/**
 * Sends a private DM reply to the author of a comment, addressing the
 * Instagram business account directly via igId rather than the Page node
 * (Meta's Messenger Platform private-reply endpoint also accepts
 * `/<IG_ID>/messages` — see
 * https://developers.facebook.com/docs/messenger-platform/instagram/features/private-replies).
 */
export const sendPrivateReply = (
  auth: InstagramAuthValue,
  commentId: string,
  message: string,
): Promise<{ message_id?: string; recipient_id: string }> => {
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${auth.metadata.igId}/messages`

  return rescue(endpoint, () =>
    instagramGraphClient.post<{
      message_id?: string
      recipient_id: string
    }>(endpoint, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
      json: {
        recipient: { comment_id: commentId },
        message: { text: message },
      },
      retry: 0,
    }),
  )
}

export const likeComment = (
  auth: InstagramAuthValue,
  commentId: string,
  liked: boolean,
): Promise<{ success: boolean }> => {
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${auth.metadata.igId}/likes`

  const searchParams = {
    access_token: auth.tokens.accessToken,
    comment_id: commentId,
  }

  if (liked) {
    return rescue(endpoint, () =>
      instagramGraphClient.post<{ success: boolean }>(endpoint, {
        searchParams,
      }),
    )
  }

  return rescue(endpoint, () =>
    instagramGraphClient.delete<{ success: boolean }>(endpoint, {
      searchParams,
    }),
  )
}
