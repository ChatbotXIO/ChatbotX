import type { CommentHandlers } from "@chatbotx.io/sdk"
import {
  deleteComment as deleteCommentApi,
  editComment as editCommentApi,
  hideComment as hideCommentApi,
  likeComment as likeCommentApi,
} from "../../apis/comment"
import { mapToChannelError } from "../../lib/error-mapper"
import { logger } from "../../lib/logger"
import type { MessengerAuthValue } from "../../schema"

export const deleteComment: CommentHandlers<MessengerAuthValue>["deleteComment"] =
  async ({ ctx, data }) => {
    try {
      await deleteCommentApi(ctx.auth, data.commentId)
      logger.info(`Comment deleted: ${data.commentId}`)
    } catch (error) {
      logger.error(error, "An error occurred while deleting the comment")
      throw mapToChannelError(error)
    }
  }

export const editComment: CommentHandlers<MessengerAuthValue>["editComment"] =
  async ({ ctx, data }) => {
    try {
      await editCommentApi(
        ctx.auth,
        data.commentId,
        data.newText,
        data.newAttachmentUrl,
      )
      logger.info(`Comment edited: ${data.commentId}`)
    } catch (error) {
      logger.error(error, "An error occurred while editing the comment")
      throw mapToChannelError(error)
    }
  }

export const likeComment: CommentHandlers<MessengerAuthValue>["likeComment"] =
  async ({ ctx, data }) => {
    try {
      await likeCommentApi(ctx.auth, data.commentId, data.liked)
      logger.info(
        `Comment ${data.liked ? "liked" : "unliked"}: ${data.commentId}`,
      )
    } catch (error) {
      logger.error(error, "An error occurred while liking the comment")
      throw mapToChannelError(error)
    }
  }

export const hideComment: CommentHandlers<MessengerAuthValue>["hideComment"] =
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
