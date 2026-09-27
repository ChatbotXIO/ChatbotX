import type { CommentHandlers } from "@chatbotx.io/sdk"
import {
  deleteComment as deleteCommentApi,
  hideComment as hideCommentApi,
  likeComment as likeCommentApi,
} from "../../apis/comment"
import { mapToChannelError } from "../../lib/error-mapper"
import { requirePostId } from "../../lib/guards"
import { logger } from "../../lib/logger"
import type { TiktokAuthValue } from "../../schema"

export const likeComment: CommentHandlers<TiktokAuthValue>["likeComment"] =
  async (props) => {
    const {
      ctx,
      data: { commentId, liked },
    } = props

    try {
      // `business/comment/like/` is addressed by comment id alone — unlike
      // hide, it takes no video id.
      await likeCommentApi(ctx.auth.tokens.accessToken, {
        businessId: ctx.auth.metadata.openId,
        commentId,
        action: liked ? "LIKE" : "UNLIKE",
      })
    } catch (error) {
      const channelError = mapToChannelError(error)
      logger.error(
        { commentId, liked, channelErrorCategory: channelError.category },
        "Failed to change TikTok comment like state",
      )
      throw channelError
    }
  }

export const hideComment: CommentHandlers<TiktokAuthValue>["hideComment"] =
  async (props) => {
    const {
      ctx,
      data: { commentId, hidden, postId },
    } = props

    const videoId = requirePostId(postId, hidden ? "hide" : "unhide")

    try {
      await hideCommentApi(ctx.auth.tokens.accessToken, {
        businessId: ctx.auth.metadata.openId,
        videoId,
        commentId,
        action: hidden ? "HIDE" : "UNHIDE",
      })
    } catch (error) {
      const channelError = mapToChannelError(error)
      logger.error(
        {
          commentId,
          videoId,
          hidden,
          channelErrorCategory: channelError.category,
        },
        "Failed to change TikTok comment visibility",
      )
      throw channelError
    }
  }

export const deleteComment: CommentHandlers<TiktokAuthValue>["deleteComment"] =
  async (props) => {
    const {
      ctx,
      data: { commentId },
    } = props

    try {
      await deleteCommentApi(ctx.auth.tokens.accessToken, {
        businessId: ctx.auth.metadata.openId,
        commentId,
      })
    } catch (error) {
      const channelError = mapToChannelError(error)
      logger.error(
        { commentId, channelErrorCategory: channelError.category },
        "Failed to delete TikTok comment",
      )
      throw channelError
    }
  }
