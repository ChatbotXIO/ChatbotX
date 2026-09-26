import type { Context, IncomingAttachment } from "@chatbotx.io/sdk"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import {
  type FacebookMessage,
  type FacebookMessageAttachmentPayload,
  type FacebookSendMessageResponse,
  MESSENGER_MESSAGE_METADATA,
  type MessengerAuthValue,
} from "../schema"
import { getMessageAttachmentEntity } from "./attachment"

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
      retry: 0,
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
 * Sends a private reply anchored to a comment (Facebook's comment_id-anchored
 * Send API, which bypasses the normal messaging-window requirement) with an
 * arbitrary message payload (text, image, attachment, quick replies, …) —
 * used by flow-based private replies to deliver the *first* outgoing message
 * of the run. `FacebookSendMessageRequest["recipient"]` has no `comment_id`
 * variant, so this posts a raw payload rather than reusing `sendPageMessage`.
 *
 * Stamps `message.metadata` like every other Messenger send path so the
 * message_echo webhook (`handlers/webhook.ts`) recognizes and skips our own
 * echo instead of re-ingesting it as an incoming message.
 */
export const sendPrivateReplyMessage = (
  auth: MessengerAuthValue,
  commentId: string,
  message: FacebookMessage | FacebookMessageAttachmentPayload,
  personaId?: string,
): Promise<FacebookSendMessageResponse> => {
  const { version = DEFAULT_API_VERSION } = auth
  const pageId = auth.metadata.pageId
  const endpoint = `${version}/${pageId}/messages`

  return rescue(endpoint, () =>
    facebookGraphClient.post<FacebookSendMessageResponse>(endpoint, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
      json: {
        recipient: { comment_id: commentId },
        message: { ...message, metadata: MESSENGER_MESSAGE_METADATA },
        persona_id: personaId,
      },
      retry: 0,
    }),
  )
}

export const sendPrivateReply = (
  auth: MessengerAuthValue,
  commentId: string,
  message: string,
): Promise<FacebookSendMessageResponse> =>
  sendPrivateReplyMessage(auth, commentId, { text: message })

/**
 * Fetches the attachment type of a comment (e.g. "photo", "video_inline",
 * "share", "animated_image_share"), or null if the comment has no attachment.
 */
export const getCommentAttachmentType = (props: {
  ctx: Context<MessengerAuthValue>
  input: { commentId: string }
}): Promise<string | null> => {
  const { ctx, input } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const endpoint = `${version}/${input.commentId}`

  return rescue(endpoint, async () => {
    const res = await facebookGraphClient.get<{
      attachment?: { type?: string }
    }>(endpoint, {
      headers: {
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
      searchParams: {
        fields: "attachment",
      },
    })
    return res.attachment?.type ?? null
  })
}

/**
 * Fetches the profiles tagged inside a comment's text.
 *
 * Only used as a fallback: the `feed` webhook already carries `message_tags`
 * when a comment tags someone, so this costs a Graph call only when the
 * webhook omitted the key. Returns `[]` — never null — because an untagged
 * comment and a comment whose tags we failed to read must not be told apart by
 * the caller; a failed read is surfaced by `rescue` throwing instead.
 */
export const getCommentMessageTags = (props: {
  ctx: Context<MessengerAuthValue>
  input: { commentId: string }
}): Promise<{ id: string; name?: string }[]> => {
  const { ctx, input } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const endpoint = `${version}/${input.commentId}`

  return rescue(endpoint, async () => {
    const res = await facebookGraphClient.get<{
      message_tags?: { id?: string; name?: string }[]
    }>(endpoint, {
      headers: {
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
      searchParams: {
        fields: "message_tags",
      },
    })
    return (res.message_tags ?? []).flatMap(({ id, name }) =>
      id ? [{ id, name }] : [],
    )
  })
}

type CommentAttachmentResponse = {
  type?: string
  url?: string
  unshimmed_url?: string
  target?: { url?: string }
  media?: { image?: { src?: string }; source?: string }
}

// `unshimmed_url` is not a default subfield, so the attachment fields are
// listed explicitly.
const COMMENT_ATTACHMENT_FIELDS =
  "attachment{type,url,unshimmed_url,target,media}"

function toHttpsUrl(link: string | undefined): string | null {
  if (!link) {
    return null
  }
  try {
    const url = new URL(link)
    return url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * Facebook wraps an outbound link as `https://l.facebook.com/l.php?u=<url>`.
 * Returns the wrapped https URL, or null when the link is not wrapped.
 */
export function unwrapFacebookRedirectUrl(
  link: string | undefined,
): string | null {
  if (!link) {
    return null
  }
  try {
    const url = new URL(link)
    if (!(url.hostname.endsWith("facebook.com") && url.pathname === "/l.php")) {
      return null
    }
    const target = new URL(url.searchParams.get("u") ?? "")
    return target.protocol === "https:" ? target.toString() : null
  } catch {
    return null
  }
}

/**
 * A GIF comment is an `animated_image_*` attachment. `media.image.src` is only
 * a resized still preview, so the original GIF comes first — Facebook's own
 * resolved `unshimmed_url`, else the target unwrapped from the `l.php`
 * redirect; the video rendition and the preview are fallbacks. The original
 * lives on a third-party host (Giphy, Tenor…), so it is fetched without the
 * token.
 */
function gifAttachmentCandidates(
  attachment: CommentAttachmentResponse,
): { url: string; authorize: boolean }[] {
  const originalGifUrl =
    toHttpsUrl(attachment.unshimmed_url) ??
    unwrapFacebookRedirectUrl(attachment.url) ??
    unwrapFacebookRedirectUrl(attachment.target?.url)
  const candidates = [
    originalGifUrl && { url: originalGifUrl, authorize: false },
    attachment.media?.source && {
      url: attachment.media.source,
      authorize: true,
    },
    attachment.media?.image?.src && {
      url: attachment.media.image.src,
      authorize: true,
    },
  ]
  return candidates.filter((candidate) => Boolean(candidate)) as {
    url: string
    authorize: boolean
  }[]
}

async function downloadFirstGifCandidate(
  ctx: Context<MessengerAuthValue>,
  attachment: CommentAttachmentResponse,
): Promise<IncomingAttachment | undefined> {
  for (const { url, authorize } of gifAttachmentCandidates(attachment)) {
    try {
      return await getMessageAttachmentEntity({
        ctx,
        attachment: { type: "image", payload: { url } },
        authorize,
        requireMedia: true,
      })
    } catch (error) {
      logger.warn({ err: error, url }, "Failed to download comment GIF")
    }
  }
  return
}

/**
 * Fetches a comment's attachment and, for photo and GIF attachments, downloads
 * and uploads it to storage as an IncomingAttachment. Other attachment types
 * (video_inline, share, sticker) are reported by type only.
 */
export const getCommentAttachment = async (props: {
  ctx: Context<MessengerAuthValue>
  input: { commentId: string }
}): Promise<{ type: string | null; attachment?: IncomingAttachment }> => {
  const { ctx, input } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const endpoint = `${version}/${input.commentId}`

  const res = await rescue(endpoint, () =>
    facebookGraphClient.get<{ attachment?: CommentAttachmentResponse }>(
      endpoint,
      {
        headers: {
          Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
        },
        searchParams: {
          fields: COMMENT_ATTACHMENT_FIELDS,
        },
      },
    ),
  )

  const type = res.attachment?.type ?? null
  const imageUrl = res.attachment?.media?.image?.src

  if (type === "photo" && imageUrl) {
    const attachment = await getMessageAttachmentEntity({
      ctx,
      attachment: { type: "image", payload: { url: imageUrl } },
    }).catch((error): IncomingAttachment | undefined => {
      logger.error(error, "Failed to download comment attachment")
      return
    })
    return { type, attachment }
  }

  if (res.attachment && type?.startsWith("animated_image")) {
    const attachment = await downloadFirstGifCandidate(ctx, res.attachment)
    return { type, attachment }
  }

  return { type }
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
