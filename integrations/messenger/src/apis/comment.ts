import type { Context, IncomingAttachment } from "@chatbotx.io/sdk"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type { MessengerAuthValue } from "../schema"
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

export const sendPrivateReply = (
  auth: MessengerAuthValue,
  commentId: string,
  message: string,
): Promise<{ message_id: string; recipient_id: string }> => {
  const { version = DEFAULT_API_VERSION } = auth
  const pageId = auth.metadata.pageId
  const endpoint = `${version}/${pageId}/messages`

  return rescue(endpoint, () =>
    facebookGraphClient.post<{ message_id: string; recipient_id: string }>(
      endpoint,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.tokens.accessToken}`,
        },
        json: {
          recipient: { comment_id: commentId },
          message: { text: message },
        },
      },
    ),
  )
}

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
 * Fetches a comment's attachment and, for photo attachments, downloads and
 * uploads it to storage as an IncomingAttachment. Other attachment types
 * (video_inline, share, animated_image_share) are reported by type only —
 * not implemented, to avoid guessing at an unverified media field shape.
 */
export const getCommentAttachment = async (props: {
  ctx: Context<MessengerAuthValue>
  input: { commentId: string }
}): Promise<{ type: string | null; attachment?: IncomingAttachment }> => {
  const { ctx, input } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const endpoint = `${version}/${input.commentId}`

  const res = await rescue(endpoint, () =>
    facebookGraphClient.get<{
      attachment?: { type?: string; media?: { image?: { src?: string } } }
    }>(endpoint, {
      headers: {
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
      searchParams: {
        fields: "attachment",
      },
    }),
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
