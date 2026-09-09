import { DEFAULT_API_VERSION } from "../constants"
import { InstagramException, rescue } from "../exception"
import { instagramGraphClient } from "../lib/http-client"
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
 * Sends a private DM reply to the author of a comment with an arbitrary
 * message payload (text, attachment, quick replies, …) — used by flow-based
 * private replies to deliver the *first* outgoing message of the run, and by
 * the inbox's manual private reply. The comment_id-anchored Send API bypasses
 * the normal messaging-window requirement.
 *
 * Addresses the **Page** node, not the IG business account. For Instagram via
 * Facebook Login (Page access token on graph.facebook.com) Meta only exposes
 * the `messages` edge on the Page:
 * https://developers.facebook.com/docs/messenger-platform/instagram/features/private-replies
 * Posting to `/<IG_ID>/messages` is rejected with `(#3) Application does not
 * have the capability to make this API call.` even when the app holds
 * `instagram_manage_messages`, `pages_messaging` and Human Agent at Advanced
 * Access — the code means "this edge does not exist here", not "permission
 * missing". That matches the rest of this package: messaging edges use the
 * Page node (`{pageId}/message_attachments`, `me/messages`) while IG content
 * edges use the IG node (`{igId}/media`, `{igId}/likes`), and it matches
 * messenger's identical `sendPrivateReplyMessage` (`{pageId}/messages`).
 *
 * DO NOT "fix" this back to `igId`. That has already shipped twice: #875 moved
 * it to `pageId`, then #945 moved it back to make a stale test green (the test
 * fixture had no `pageId`, so the endpoint silently became `/undefined/…`),
 * which broke every private reply in production again. The Instagram Login
 * variant is different on purpose — it uses `me/messages` on
 * graph.instagram.com.
 *
 * Stamps `message.metadata` like every other Instagram send path so the
 * message_echo webhook (`handlers/webhook.ts`) recognizes and skips our own
 * echo instead of re-ingesting it as an incoming message.
 */
// `async` so the pageId guard below rejects the returned promise instead of
// throwing synchronously — callers await it, and a sync throw would escape a
// `.catch()` attached to the result.
export const sendPrivateReplyMessage = async (
  auth: InstagramAuthValue,
  commentId: string,
  message: InstagramSendMessage | InstagramMessageAttachmentPayload,
): Promise<InstagramSendMessageResponse> => {
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const pageId = auth.metadata.pageId
  // Without this the endpoint becomes `/undefined/messages`, which Meta
  // answers with a generic error that hides the real cause — exactly how the
  // #875 → #945 regression went unnoticed.
  if (!pageId) {
    throw new InstagramException(
      "Cannot send an Instagram private reply: the integration has no pageId. Reconnect the Instagram account.",
    )
  }
  const endpoint = `${version}/${pageId}/messages`

  return await rescue(endpoint, () =>
    instagramGraphClient.post<InstagramSendMessageResponse>(endpoint, {
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
