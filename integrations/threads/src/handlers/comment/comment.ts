import type { CommentHandlers } from "@chatbotx.io/sdk"
import { hideComment as hideCommentApi } from "../../apis/comment"
import { mapToChannelError } from "../../lib/error-mapper"
import { getSafeErrorDetails } from "../../lib/error-sanitizer"
import { logger } from "../../lib/logger"
import type { ThreadsAuthValue } from "../../schema"

export const hideComment: CommentHandlers<ThreadsAuthValue>["hideComment"] =
  async (props) => {
    const {
      ctx,
      data: { commentId, hidden },
    } = props

    try {
      await hideCommentApi(ctx.auth, commentId, hidden)
    } catch (error) {
      const channelError = mapToChannelError(error)
      const safeError = getSafeErrorDetails(error)
      logger.error(
        {
          commentId,
          hidden,
          channelErrorCategory: channelError.category,
          errorCode: safeError.code,
          errorHttpStatusCode: safeError.httpStatusCode,
        },
        "Failed to change Threads reply visibility",
      )
      throw channelError
    }
  }
