import {
  type Context,
  contentTypes,
  type IncomingContact,
  type IncomingMessage,
  type MessageSharedPostEntity,
  messageTypes,
  type ReceivedMessageResult,
} from "@chatbotx.io/sdk"
import { TiktokException } from "../../exception"
import { logger } from "../../lib/logger"
import type { TiktokAuthValue, TiktokDmMessageContent } from "../../schema"
import {
  tiktokDmMessageContentSchema,
  tiktokWebhookEventSchema,
} from "../../schema"

/**
 * A shared post, rendered as its link.
 *
 * The link is TikTok's own `embed_url`, used verbatim. The webhook carries no
 * author handle, so the canonical `tiktok.com/@<user>/video/<id>` form cannot be
 * built without inventing one — and `tiktok.com/video/<id>` (no handle) is a
 * hard 404. A player URL that works beats a pretty URL that does not.
 *
 * Returns `undefined` when TikTok sent no `share_post` object, so the caller
 * keeps its existing behaviour rather than emitting a half-built entity.
 */
const resolveSharedPost = (
  content: TiktokDmMessageContent,
): { text: string; contentAttributes: MessageSharedPostEntity } | undefined => {
  const sharedPost = content.share_post
  if (!sharedPost) {
    return
  }
  return {
    text: sharedPost.embed_url ?? sharedPost.video_id,
    contentAttributes: {
      type: "shared_post",
      sharedPost: {
        postId: sharedPost.video_id,
        url: sharedPost.embed_url,
      },
    },
  }
}

function detectImageMimeType(url: string): string {
  const ext = url.split("?")[0]?.split(".").pop()?.toLowerCase()
  const mimeMap: Record<string, string> = {
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
  }
  return (ext && mimeMap[ext]) ?? "image/jpeg"
}

// biome-ignore lint/suspicious/useAwait: MessageHandlers interface requires async
export const receiveMessage = async ({
  ctx: _ctx,
  data,
}: {
  ctx: Context<TiktokAuthValue>
  data: {
    integrationType: string
    integrationIdentifier: string
    payload: unknown
  }
}): Promise<ReceivedMessageResult> => {
  const event = tiktokWebhookEventSchema.parse(data.payload)

  let contentData: unknown
  try {
    contentData = JSON.parse(event.content)
  } catch (err) {
    throw new TiktokException(
      `Failed to parse message content: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const messageContent = tiktokDmMessageContentSchema.safeParse(contentData)
  if (!messageContent.success) {
    throw new TiktokException("Unrecognized message content format")
  }

  const content = messageContent.data

  // im_send_msg is an echo: the business sent this message via API
  const isEcho = event.event === "im_send_msg"

  const sharedPost =
    content.type === "share_post" ? resolveSharedPost(content) : undefined

  const incomingMessage: IncomingMessage = {
    sourceId: content.message_id ?? String(event.create_time),
    messageType: isEcho
      ? messageTypes.enum.outgoing
      : messageTypes.enum.incoming,
    text: content.type === "text" ? content.text?.body : sharedPost?.text,
    contentType: contentTypes.enum.text,
    contentAttributes: sharedPost?.contentAttributes,
    attachments:
      content.type === "image" && content.media_url
        ? [
            {
              sourceId: content.message_id ?? String(event.create_time),
              fileType: "image" as const,
              mimeType: detectImageMimeType(content.media_url),
              originPath: content.media_url,
              size: 0,
              url: content.media_url,
            },
          ]
        : [],
  }

  // A content type this handler cannot render still produces a message row —
  // an empty one that nonetheless fires `message:received` for every flow and
  // automation listening. That is how `share_post` went unnoticed, so the shape
  // itself is what gets flagged rather than a list of known types, which would
  // have to be remembered again the next time TikTok adds one.
  if (!(incomingMessage.text || incomingMessage.attachments?.length)) {
    logger.warn(
      { contentType: content.type, messageId: content.message_id },
      "TikTok DM produced an empty message row — unrendered content type",
    )
  }

  // For echo (outgoing) messages, the business is from_user so the customer is
  // to_user. `content.unique_identifier` is the same globally unique user id
  // the `comment.update` webhook carries — which is what makes a commenter and
  // a DM sender resolve to ONE contact — but it is deliberately not read here:
  // on an echo the roles reverse and TikTok does not document whose id it then
  // holds, so reading it would risk keying the contact to the business itself.
  // `from_user`/`to_user` say which side is which; this stays the only source.
  const customerOpenId = isEcho
    ? (content.to_user?.id ?? content.to ?? content.from_user.id)
    : content.from_user.id

  const contact: IncomingContact = {
    sourceId: customerOpenId,
    // TikTok's conversation_id addresses the DM at send time, but it must not
    // key the conversation row: `Conversation.sourceId` is reserved for comment
    // threads (the video id), and a contact can have both.
    channelConversationId: content.conversation_id,
    firstName: isEcho
      ? (content.to ?? content.to_user?.id ?? content.from_user.id)
      : (content.from ?? content.from_user.id),
    lastName: "",
  }

  return {
    message: incomingMessage,
    contact,
    postbackAction:
      content.reply_source_payload?.reply_source_unique_id &&
      !content.reply_source_payload.reply_source_unique_id.startsWith("http")
        ? content.reply_source_payload.reply_source_unique_id
        : null,
    quickReplyAction: null,
    ref: null,
  }
}
