import {
  ChannelError,
  ChannelErrorCategory,
  type CommentHandlers,
} from "@chatbotx.io/sdk"
import { sendCommentReply } from "../../apis/comment"
import { mapToChannelError } from "../../lib/error-mapper"
import { getSafeErrorDetails } from "../../lib/error-sanitizer"
import { logger } from "../../lib/logger"
import type { ThreadsAuthValue } from "../../schema"

export const sendComment: CommentHandlers<ThreadsAuthValue>["sendComment"] =
  async (props) => {
    const {
      ctx,
      data: { message },
    } = props

    const replyToCommentId = message.contentAttributes?.replyToCommentId
    if (typeof replyToCommentId !== "string" || !replyToCommentId.trim()) {
      throw new ChannelError(
        "Cannot send comment reply: replyToCommentId is missing. The outgoing message must be linked to a parent comment.",
        ChannelErrorCategory.PAYLOAD_INVALID,
      )
    }

    const text = message.text?.trim()
    if (!text) {
      throw new ChannelError(
        "Cannot send comment reply: text is required.",
        ChannelErrorCategory.PAYLOAD_INVALID,
      )
    }

    try {
      const result = await sendCommentReply(ctx.auth, replyToCommentId, text)
      return { messageIds: result.id ? [result.id] : [] }
    } catch (error) {
      const channelError = mapToChannelError(error)
      const safeError = getSafeErrorDetails(error)

      logger.error(
        {
          replyToCommentId,
          channelErrorCategory: channelError.category,
          errorCode: safeError.code,
          errorHttpStatusCode: safeError.httpStatusCode,
          errorSubCode: safeError.subCode,
          errorType: safeError.type,
        },
        "Failed to send Threads comment reply",
      )
      throw channelError
    }
  }
