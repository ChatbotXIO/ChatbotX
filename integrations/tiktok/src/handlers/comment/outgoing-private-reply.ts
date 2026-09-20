import {
  ChannelError,
  ChannelErrorCategory,
  type CommentHandlers,
} from "@chatbotx.io/sdk"
import { sendTiktokCommentPrivateReply } from "../../apis/message"
import { mapToChannelError } from "../../lib/error-mapper"
import { logger } from "../../lib/logger"
import type { TiktokAuthValue } from "../../schema"

/**
 * Answers a comment with a DM, via Comment-to-Message.
 *
 * Unlike every other TikTok send this needs no `conversation_id` — the
 * `comment_id` is the address — which is the whole reason a business can reach
 * a commenter who has never messaged it. What it needs instead is TikTok's
 * permission: Comment-to-Message enabled on the account, the comment flagged
 * high intent, and the send conditions in `sendTiktokCommentPrivateReply`.
 *
 * Text only. TikTok's documented `direct_reply` payload is `message_type:
 * "TEXT"`, so an attachment is rejected rather than dropped — reporting a reply
 * as delivered while silently losing its media is the worse failure.
 */
export const sendPrivateReply: CommentHandlers<TiktokAuthValue>["sendPrivateReply"] =
  async (props) => {
    const {
      ctx,
      data: { message },
    } = props

    const replyToCommentId = message.contentAttributes?.replyToCommentId
    if (typeof replyToCommentId !== "string" || !replyToCommentId.trim()) {
      throw new ChannelError(
        "Cannot send TikTok private reply: replyToCommentId is missing. The outgoing message must be linked to a parent comment.",
        ChannelErrorCategory.PAYLOAD_INVALID,
      )
    }

    if (message.attachments?.length) {
      throw new ChannelError(
        "TikTok private replies cannot carry attachments.",
        ChannelErrorCategory.PAYLOAD_INVALID,
      )
    }

    const text = message.text?.trim()
    if (!text) {
      logger.warn(
        { replyToCommentId },
        "sendPrivateReply: message has no text — skipping API call",
      )
      return { messageIds: [] }
    }

    try {
      const messageId = await sendTiktokCommentPrivateReply(
        ctx.auth.tokens.accessToken,
        {
          businessId: ctx.auth.metadata.openId,
          commentId: replyToCommentId,
          text,
        },
      )
      return { messageIds: messageId ? [messageId] : [] }
    } catch (error) {
      const channelError = mapToChannelError(error)
      logger.error(
        {
          replyToCommentId,
          channelErrorCategory: channelError.category,
        },
        "Failed to send TikTok private reply",
      )
      throw channelError
    }
  }
