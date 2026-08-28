import {
  ChannelError,
  ChannelErrorCategory,
  type CommentHandlers,
} from "@chatbotx.io/sdk"
import { sendPrivateReplyMessage } from "../../../apis/comment"
import { mapToChannelError } from "../../../lib/error-mapper"
import { logger } from "../../../lib/logger"
import type { InstagramAuthValue } from "../../../schemas"
import { convertMessageToInstagramMessage } from "../../message/outgoing-message"

export const sendPrivateReply: CommentHandlers<InstagramAuthValue>["sendPrivateReply"] =
  async (props) => {
    const {
      ctx,
      data: { message },
    } = props

    const replyToCommentId = message.contentAttributes?.replyToCommentId
    if (typeof replyToCommentId !== "string") {
      throw new ChannelError(
        "Cannot send private reply: replyToCommentId is missing. The outgoing message must be linked to a parent comment.",
        ChannelErrorCategory.PAYLOAD_INVALID,
      )
    }

    // Same text/attachment-to-Send-API-message conversion the regular
    // sendMessage handler uses — one yielded item per text/attachment, since
    // Meta's Send API only accepts one of either per call.
    const instagramMessages = [...convertMessageToInstagramMessage(message)]
    if (instagramMessages.length === 0) {
      logger.warn(
        { replyToCommentId },
        "sendPrivateReply: message has no text or attachments — skipping API call",
      )
      return { messageIds: [] }
    }

    const messageIds: string[] = []
    try {
      for (const instagramMessage of instagramMessages) {
        const result = await sendPrivateReplyMessage(
          ctx.auth,
          replyToCommentId,
          instagramMessage,
        )
        if (result.message_id) {
          messageIds.push(result.message_id)
        }
      }
      return { messageIds }
    } catch (error) {
      logger.error(error, "An error occurred while sending the private reply")
      throw mapToChannelError(error)
    }
  }
