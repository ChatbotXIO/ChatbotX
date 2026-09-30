import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { instagramBusinessClient } from "../lib/http-client"
import {
  INSTAGRAM_MESSAGE_METADATA,
  type InstagramAuthValue,
  type InstagramMessageAttachmentPayload,
  type InstagramSendMessage,
  type InstagramSendMessageResponse,
} from "../schema"

export const replyToComment = (
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
 * `me/messages` endpoint — matching `sendMessage` in `apis/message.ts` — using the comment
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

type InstagramMediaCommentFields = {
  id: string
  text?: string
  timestamp: string
  username?: string
  from?: { id: string; username?: string }
  parent_id?: string
}

export type InstagramMediaComment = InstagramMediaCommentFields & {
  replies?: { data: InstagramMediaCommentFields[] }
}

export type InstagramMediaCommentPage = {
  comments: InstagramMediaComment[]
  /** Cursor for the next page; absent on the last one. */
  nextCursor?: string
}

const MEDIA_COMMENT_FIELDS =
  "id,text,timestamp,username,from{id,username},parent_id"

/**
 * One page of a media's top-level comments, each carrying its replies. The
 * edge has no ordering parameter, so the caller cannot stop early on age.
 */
export const listMediaComments = (props: {
  auth: InstagramAuthValue
  mediaId: string
  after?: string
}): Promise<InstagramMediaCommentPage> => {
  const { auth, mediaId, after } = props
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${mediaId}/comments`

  return rescue(endpoint, async () => {
    const res = await instagramBusinessClient.get<{
      data: InstagramMediaComment[]
      paging?: { cursors?: { after?: string }; next?: string }
    }>(endpoint, {
      headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
      searchParams: {
        fields: `${MEDIA_COMMENT_FIELDS},replies{${MEDIA_COMMENT_FIELDS}}`,
        limit: "50",
        ...(after ? { after } : {}),
      },
    })
    return {
      comments: res.data,
      nextCursor: res.paging?.next ? res.paging.cursors?.after : undefined,
    }
  })
}
