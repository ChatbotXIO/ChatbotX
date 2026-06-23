import type { CommentHandlers } from "@chatbotx.io/sdk"
import {
  deleteComment as deleteCommentApi,
  hideComment as hideCommentApi,
} from "../../apis/comment"
import { mapToChannelError } from "../../lib/error-mapper"
import { logger } from "../../lib/logger"
import type { InstagramAuthValue } from "../../schemas"

export const deleteComment: CommentHandlers<InstagramAuthValue>["deleteComment"] =
  async ({ ctx, data }) => {
    try {
      await deleteCommentApi(ctx.auth, data.commentId)
      logger.info(`Comment deleted: ${data.commentId}`)
    } catch (error) {
      logger.error(error, "An error occurred while deleting the comment")
      throw mapToChannelError(error)
    }
  }

export const hideComment: CommentHandlers<InstagramAuthValue>["hideComment"] =
  async ({ ctx, data }) => {
    try {
      await hideCommentApi(ctx.auth, data.commentId, data.hidden)
      logger.info(
        `Comment ${data.hidden ? "hidden" : "unhidden"}: ${data.commentId}`,
      )
    } catch (error) {
      logger.error(error, "An error occurred while hiding the comment")
      throw mapToChannelError(error)
    }
  }

export const likeComment: CommentHandlers<InstagramAuthValue>["likeComment"] =
  ({ data }) => {
    logger.info(
      { commentId: data.commentId },
      "likeComment: Instagram does not support liking comments via API, skipping",
    )
    return Promise.resolve()
  }

export const editComment: CommentHandlers<InstagramAuthValue>["editComment"] =
  ({ data }) => {
    logger.info(
      { commentId: data.commentId },
      "editComment: Instagram does not support editing comments via API, skipping",
    )
    return Promise.resolve()
  }
