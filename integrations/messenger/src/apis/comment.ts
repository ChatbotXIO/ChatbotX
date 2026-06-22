import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
import type { MessengerAuthValue } from "../schema"

export const sendComment = (
  auth: MessengerAuthValue,
  commentId: string,
  message: string | null,
  attachmentUrl?: string,
): Promise<{ id: string }> => {
  const { version = DEFAULT_API_VERSION } = auth
  const endpoint = `${version}/${commentId}/comments`

  const body: Record<string, string> = {}
  if (message) {
    body.message = message
  }
  if (attachmentUrl) {
    body.attachment_url = attachmentUrl
  }

  return rescue(endpoint, () =>
    facebookGraphClient.post<{ id: string }>(endpoint, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
      json: body,
    }),
  )
}

export const editComment = (
  auth: MessengerAuthValue,
  commentId: string,
  message: string,
  attachmentUrl?: string,
): Promise<{ success: boolean }> => {
  const { version = DEFAULT_API_VERSION } = auth
  const endpoint = `${version}/${commentId}`

  return rescue(endpoint, () =>
    facebookGraphClient.post<{ success: boolean }>(endpoint, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
      json: attachmentUrl
        ? { message, attachment_url: attachmentUrl }
        : { message },
    }),
  )
}

/**
 * Deletes a comment on Facebook. Facebook cascades the deletion to all of the
 * comment's replies (child comments), so callers only need to delete the parent.
 */
export const deleteComment = (
  auth: MessengerAuthValue,
  commentId: string,
): Promise<{ success: boolean }> => {
  const { version = DEFAULT_API_VERSION } = auth
  const endpoint = `${version}/${commentId}`

  return rescue(endpoint, () =>
    facebookGraphClient.delete<{ success: boolean }>(endpoint, {
      headers: {
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
    }),
  )
}

/**
 * Likes or unlikes a comment on Facebook.
 * liked=true  → POST  /{commentId}/likes
 * liked=false → DELETE /{commentId}/likes
 */
export const likeComment = (
  auth: MessengerAuthValue,
  commentId: string,
  liked: boolean,
): Promise<{ success: boolean }> => {
  const { version = DEFAULT_API_VERSION } = auth
  const endpoint = `${version}/${commentId}/likes`

  return rescue(endpoint, () =>
    liked
      ? facebookGraphClient.post<{ success: boolean }>(endpoint, {
          headers: {
            Authorization: `Bearer ${auth.tokens.accessToken}`,
          },
        })
      : facebookGraphClient.delete<{ success: boolean }>(endpoint, {
          headers: {
            Authorization: `Bearer ${auth.tokens.accessToken}`,
          },
        }),
  )
}

/**
 * Hides or unhides a comment on Facebook via is_hidden field.
 */
export const hideComment = (
  auth: MessengerAuthValue,
  commentId: string,
  hidden: boolean,
): Promise<{ success: boolean }> => {
  const { version = DEFAULT_API_VERSION } = auth
  const endpoint = `${version}/${commentId}`

  return rescue(endpoint, () =>
    facebookGraphClient.post<{ success: boolean }>(endpoint, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
      json: { is_hidden: hidden },
    }),
  )
}
