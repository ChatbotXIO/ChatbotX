import {
  type Context,
  contentTypes,
  type IncomingContact,
  type IncomingMessage,
  messageTypes,
  type ReceivedMessageResult,
} from "@chatbotx.io/sdk"
import { TiktokException } from "../../exception"
import type { TiktokAuthValue } from "../../schema"
import {
  tiktokDmMessageContentSchema,
  tiktokWebhookEventSchema,
} from "../../schema"

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

  const incomingMessage: IncomingMessage = {
    sourceId: content.message_id ?? String(event.create_time),
    messageType: isEcho
      ? messageTypes.enum.outgoing
      : messageTypes.enum.incoming,
    text: content.type === "text" ? content.text?.body : undefined,
    contentType: contentTypes.enum.text,
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

  // For echo (outgoing) messages, the business is from_user so the customer is to_user
  const customerOpenId = isEcho
    ? (content.to_user?.id ?? content.to ?? content.from_user.id)
    : content.from_user.id

  const contact: IncomingContact = {
    sourceId: customerOpenId,
    sourceConversationId: content.conversation_id,
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
