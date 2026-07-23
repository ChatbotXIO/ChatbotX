import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { instagramBusinessClient } from "../lib/http-client"
import type { InstagramAuthValue } from "../schemas"

export const sendComment = (
  auth: InstagramAuthValue,
  commentId: string,
  message: string | null,
): Promise<{ id: string }> => {
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${commentId}/replies`

  return rescue(endpoint, () =>
    instagramBusinessClient.post<{ id: string }>(endpoint, {
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
    instagramBusinessClient.delete<{ success: boolean }>(endpoint, {
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
    instagramBusinessClient.post<{ success: boolean }>(endpoint, {
      headers: {
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
      searchParams: { hide: String(hidden) },
    }),
  )
}

/**
 * Sends a private DM reply to the author of a comment. On graph.instagram.com
 * (Instagram Login), messages are sent through the `me/messages` endpoint —
 * matching sendInstagramMessage — using the comment id as the recipient reference.
 */
export const sendPrivateReply = (
  auth: InstagramAuthValue,
  commentId: string,
  message: string,
): Promise<{ message_id?: string; recipient_id: string }> => {
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/me/messages`

  return rescue(endpoint, () =>
    instagramBusinessClient.post<{
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
