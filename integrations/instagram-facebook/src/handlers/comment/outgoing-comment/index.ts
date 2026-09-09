import {
  ChannelError,
  ChannelErrorCategory,
  type CommentHandlers,
} from "@chatbotx.io/sdk"
import { sendComment as sendCommentApi } from "../../../apis/comment"
import { mapToChannelError } from "../../../lib/error-mapper"
import { logger } from "../../../lib/logger"
import type { InstagramAuthValue } from "../../../schemas"

export const sendComment: CommentHandlers<InstagramAuthValue>["sendComment"] =
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

    // Instagram comment replies are text-only: `POST /{ig-comment-id}/replies`
    // accepts nothing but `message` (unlike a Facebook Page comment, which
    // takes `attachment_url` — see integrations/messenger). Failing loudly is
    // deliberate: returning `{ messageIds: [] }` here made a media step of a
    // public comment-reply flow vanish with nothing but a warn, while the
    // inbox still showed the message. PAYLOAD_INVALID is permanent, so the
    // send error lands on the message row and no retry re-posts the reply.
    //
    // This runs BEFORE the text check on purpose, so a caption + image fails
    // as a whole rather than posting a public reply with its media silently
    // dropped ("look at this 👇" alone reads worse than an error). Posting the
    // text first and then throwing is not an option either: the reply would be
    // live on Instagram while the row is marked failed and never gets a
    // `sourceId`, which is what the inbox's edit/delete needs.
    if (message.attachments && message.attachments.length > 0) {
      throw new ChannelError(
        "Instagram comment replies cannot carry media — the reply endpoint accepts text only. Send the image or video as a private reply instead.",
        ChannelErrorCategory.PAYLOAD_INVALID,
      )
    }

    if (!message.text) {
      logger.warn(
        { replyToCommentId },
        "sendComment: message has no text — skipping API call",
      )
      return { messageIds: [] }
    }

    try {
      const result = await sendCommentApi(
        ctx.auth,
        replyToCommentId,
        message.text,
      )
      return { messageIds: result.id ? [result.id] : [] }
    } catch (error) {
      logger.error(error, "An error occurred while sending the comment reply")
      throw mapToChannelError(error)
    }
  }
