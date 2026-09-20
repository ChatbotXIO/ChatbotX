import { rescue, TiktokAPIException } from "../exception"
import { createTiktokBusinessClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type {
  BusinessApiResponse,
  TiktokAuthValue,
  TiktokSendMessageRequest,
} from "../schema"

type SendMessageResult = {
  // TikTok's business/message/send/ response nests the created message's id
  // under data.message.message_id, not data.message_id — keep the flat field
  // as a defensive fallback in case a message_type returns a flatter shape.
  message_id?: string
  message?: {
    message_id?: string
  }
}

type UploadMediaResult = {
  media_id?: string
}

export const uploadTiktokMedia = (
  accessToken: string,
  businessId: string,
  imageUrl: string,
): Promise<string> =>
  rescue("business/message/media/upload", async () => {
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageUrl}`)
    }
    const blob = await imageResponse.blob()

    const form = new FormData()
    form.append("business_id", businessId)
    form.append("file", blob)
    form.append("media_type", "IMAGE")

    const client = createTiktokBusinessClient(accessToken)
    const response = await client.postFormData<
      BusinessApiResponse<UploadMediaResult>
    >("business/message/media/upload/", form)

    if (response.code !== 0) {
      throw new TiktokAPIException(
        response.message ?? "TikTok media upload failed",
      )
    }

    const mediaId = response.data?.media_id
    if (!mediaId) {
      throw new Error("No media_id in TikTok upload response")
    }
    return mediaId
  })

/**
 * Length limit `business/message/send/` enforces on `text.body`, spaces and
 * emojis included. Checked here rather than left to the API so an over-long
 * automation reply fails with something a workspace can act on.
 */
const TIKTOK_MESSAGE_TEXT_LIMIT = 6000

export const sendTiktokMessage = (
  accessToken: string,
  payload: TiktokSendMessageRequest,
): Promise<string | undefined> =>
  rescue("business/message/send", async () => {
    const client = createTiktokBusinessClient(accessToken)
    const response = await client.post<BusinessApiResponse<SendMessageResult>>(
      "business/message/send/",
      { json: payload },
    )

    if (response.code !== 0) {
      throw new TiktokAPIException(
        response.message ?? "TikTok message send failed",
      )
    }

    const messageId =
      response.data?.message?.message_id ?? response.data?.message_id
    if (!messageId) {
      logger.warn(
        { data: response.data },
        "No message_id in TikTok send response — outgoing message row will keep sourceId=null and its echo will be inserted as a new row",
      )
    }
    return messageId
  })

/**
 * The Comment-to-Message send: a DM answering a comment, addressed by
 * `comment_id` alone — no `conversation_id`, and therefore no requirement that
 * the contact ever messaged the business.
 *
 * TikTok accepts it only when every one of its own conditions holds: the
 * comment is first-level on the business's own video, under 48 hours old, not
 * already answered by DM from anywhere (the TikTok app included), the commenter
 * had no DM with the business in the past 24 hours and is over 18, and
 * Comment-to-Message is enabled on the account. None of that is checkable from
 * here, so a rejection arrives as a `TiktokAPIException` carrying TikTok's own
 * wording — callers must surface it rather than flatten it into "send failed".
 */
export const sendTiktokCommentPrivateReply = (
  accessToken: string,
  params: { businessId: string; commentId: string; text: string },
): Promise<string | undefined> => {
  if (params.text.length > TIKTOK_MESSAGE_TEXT_LIMIT) {
    return Promise.reject(
      new TiktokAPIException(
        `TikTok private reply text exceeds ${TIKTOK_MESSAGE_TEXT_LIMIT} characters`,
      ),
    )
  }

  return sendTiktokMessage(accessToken, {
    business_id: params.businessId,
    direct_reply: {
      reply_type: "COMMENT_REPLY",
      comment_reply: { comment_id: params.commentId },
    },
    message_type: "TEXT",
    text: { body: params.text },
  })
}

/**
 * `(auth, commentId, text)` shape, matching the other channels' exports so the
 * comment-automation `PRIVATE_REPLY_TEXT_SENDERS` map stays uniform across
 * channels. TikTok reads the `business_id` off the auth value's `openId`, where
 * every other Business API call on this channel already reads it.
 */
export const sendPrivateReply = (
  auth: TiktokAuthValue,
  commentId: string,
  text: string,
): Promise<string | undefined> =>
  sendTiktokCommentPrivateReply(auth.tokens.accessToken, {
    businessId: auth.metadata.openId,
    commentId,
    text,
  })
