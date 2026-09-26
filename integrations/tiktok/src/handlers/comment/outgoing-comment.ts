import {
  ChannelError,
  ChannelErrorCategory,
  type CommentHandlers,
} from "@chatbotx.io/sdk"
import { replyToComment } from "../../apis/comment"
import { mapToChannelError } from "../../lib/error-mapper"
import { requirePostId } from "../../lib/guards"
import { logger } from "../../lib/logger"
import type { TiktokAuthValue } from "../../schema"

export const sendComment: CommentHandlers<TiktokAuthValue>["sendComment"] =
  async (props) => {
    const {
      ctx,
      data: { contact, message },
    } = props

    const replyToCommentId = message.contentAttributes?.replyToCommentId
    if (typeof replyToCommentId !== "string" || !replyToCommentId.trim()) {
      throw new ChannelError(
        "Cannot send TikTok comment reply: replyToCommentId is missing. The outgoing message must be linked to a parent comment.",
        ChannelErrorCategory.PAYLOAD_INVALID,
      )
    }

    const text = message.text?.trim()
    if (!text) {
      throw new ChannelError(
        "Cannot send TikTok comment reply: text is required.",
        ChannelErrorCategory.PAYLOAD_INVALID,
      )
    }

    // A comment carries text or an already-uploaded image reference, never a
    // raw attachment. Surfacing this as a sendError beats dropping the media
    // silently and reporting the reply as fully delivered.
    if (message.attachments?.length) {
      throw new ChannelError(
        "TikTok comment replies cannot carry attachments.",
        ChannelErrorCategory.PAYLOAD_INVALID,
      )
    }

    // The parent comment's own post id first: `receiveComment` stamps it on
    // the comment message at ingest and nothing rewrites it, whereas the
    // conversation's `sourceId` is a shared slot that normalization can empty.
    // The conversation stays as the fallback for anything enqueued before the
    // post id was threaded through.
    const postIdFromMessage = message.contentAttributes?.postId
    const videoId = requirePostId(
      typeof postIdFromMessage === "string" && postIdFromMessage
        ? postIdFromMessage
        : contact.sourceConversationId,
      "reply to",
    )

    try {
      const created = await replyToComment(ctx.auth.tokens.accessToken, {
        businessId: ctx.auth.metadata.openId,
        videoId,
        commentId: replyToCommentId,
        text,
      })
      return {
        messageIds: created.comment_id ? [created.comment_id] : [],
        sentCount: 1,
      }
    } catch (error) {
      const channelError = mapToChannelError(error)
      logger.error(
        {
          replyToCommentId,
          videoId,
          channelErrorCategory: channelError.category,
        },
        "Failed to send TikTok comment reply",
      )
      throw channelError
    }
  }
