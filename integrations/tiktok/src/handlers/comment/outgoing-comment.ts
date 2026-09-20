import {
  ChannelError,
  ChannelErrorCategory,
  type CommentHandlers,
} from "@chatbotx.io/sdk"
import { replyToTiktokComment } from "../../apis/comment"
import { mapToChannelError } from "../../lib/error-mapper"
import { logger } from "../../lib/logger"
import type { TiktokAuthValue } from "../../schema"

/**
 * The video a comment belongs to.
 *
 * Every TikTok comment write except `like` and `delete` needs it. It is read
 * from the comment message's own `contentAttributes.postId`, stamped by
 * `receiveComment` at ingest, with the comment conversation's
 * `sourceConversationId` as the fallback — that is `Conversation.sourceId`,
 * which holds the post id by the repo-wide convention but is a slot TikTok
 * also normalizes for its DM conversations, so it can legitimately be empty.
 */
export function requirePostId(
  postId: string | null | undefined,
  action: string,
): string {
  if (!postId) {
    throw new ChannelError(
      `Cannot ${action} a TikTok comment without the video id. The comment conversation must be anchored to the post it belongs to.`,
      ChannelErrorCategory.PAYLOAD_INVALID,
      { code: "tiktok_missing_video_id" },
    )
  }
  return postId
}

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
      const created = await replyToTiktokComment(ctx.auth.tokens.accessToken, {
        businessId: ctx.auth.metadata.openId,
        videoId,
        commentId: replyToCommentId,
        text,
      })
      return { messageIds: created.comment_id ? [created.comment_id] : [] }
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
