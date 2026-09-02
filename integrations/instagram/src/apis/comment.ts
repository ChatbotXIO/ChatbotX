import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { instagramBusinessClient } from "../lib/http-client"
import {
  INSTAGRAM_MESSAGE_METADATA,
  type InstagramAuthValue,
  type InstagramMessageAttachmentPayload,
  type InstagramSendMessage,
  type InstagramSendMessageResponse,
} from "../schemas"

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
 * Sends a private DM reply to the author of a comment with an arbitrary
 * message payload (text, attachment, quick replies, …) — used by flow-based
 * private replies to deliver the *first* outgoing message of the run. On
 * graph.instagram.com (Instagram Login), messages are sent through the
 * `me/messages` endpoint — matching sendInstagramMessage — using the comment
 * id as the recipient reference (Meta's comment_id-anchored Send API, which
 * bypasses the normal messaging-window requirement).
 *
 * Stamps `message.metadata` like every other Instagram send path so the
 * message_echo webhook (`handlers/webhook.ts`) recognizes and skips our own
 * echo instead of re-ingesting it as an incoming message.
 */
export const sendPrivateReplyMessage = (
  auth: InstagramAuthValue,
  commentId: string,
  message: InstagramSendMessage | InstagramMessageAttachmentPayload,
): Promise<InstagramSendMessageResponse> => {
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/me/messages`

  return rescue(endpoint, () =>
    instagramBusinessClient.post<InstagramSendMessageResponse>(endpoint, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
      json: {
        recipient: { comment_id: commentId },
        message: { ...message, metadata: INSTAGRAM_MESSAGE_METADATA },
      },
      retry: 0,
    }),
  )
}

export const sendPrivateReply = (
  auth: InstagramAuthValue,
  commentId: string,
  message: string,
): Promise<InstagramSendMessageResponse> =>
  sendPrivateReplyMessage(auth, commentId, { text: message })
