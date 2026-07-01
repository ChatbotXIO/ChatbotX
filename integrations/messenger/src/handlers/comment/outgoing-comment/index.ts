import {
  ChannelError,
  ChannelErrorCategory,
  type CommentHandlers,
} from "@chatbotx.io/sdk"
import { sendComment as sendCommentApi } from "../../../apis/comment"
import { mapToChannelError } from "../../../lib/error-mapper"
import type { MessengerAuthValue } from "../../../schema"

export const sendComment: CommentHandlers<MessengerAuthValue>["sendComment"] =
  async (props) => {
    const {
      ctx,
      data: { message },
    } = props

    const replyToCommentId = message.contentAttributes?.replyToCommentId
    if (typeof replyToCommentId !== "string") {
      throw new ChannelError(
        "Cannot send comment reply: replyToCommentId is missing. The outgoing message must be linked to a parent comment.",
        ChannelErrorCategory.PAYLOAD_INVALID,
      )
    }

    const attachmentUrl = message.attachments?.[0]?.url
    if (!(message.text || attachmentUrl)) {
      return { messageIds: [] }
    }

    try {
      const result = await sendCommentApi(
        ctx.auth,
        replyToCommentId,
        message.text,
        attachmentUrl,
      )
      return { messageIds: result.id ? [result.id] : [] }
    } catch (error) {
      throw mapToChannelError(error)
    }
  }
