import {
  ContentType,
  type Context,
  type ConversationEntity,
  type ExternalMediaResult,
  FileType,
  type MessageEntity,
  MessageType,
  type ReceivedMessageResult,
  SdkException,
} from "@aha.chat/sdk"
import { createId } from "@paralleldrive/cuid2"
import fetch from "cross-fetch"
import imageSize from "image-size"
import type { WhatsAppAPI } from "whatsapp-api-js"
import type {
  ServerAudioMessage,
  ServerButtonMessage,
  ServerContactsMessage,
  ServerDocumentMessage,
  ServerImageMessage,
  ServerLocationMessage,
  ServerOrderMessage,
  ServerStickerMessage,
  ServerTextMessage,
  ServerVideoMessage,
} from "whatsapp-api-js/types"
import { logger } from "./lib/logger"
import type { WhatsappAuthValue, WhatsappWebhookEvent } from "./schemas"

export const parseIncomingMessage = async (
  ctx: Context<WhatsappAuthValue>,
  whatsappClient: WhatsAppAPI,
  props: WhatsappWebhookEvent,
): Promise<ReceivedMessageResult> => {
  const message: MessageEntity = {
    sourceId: props.message.id,
    messageType: MessageType.incoming,
    contentType: ContentType.text,
  }
  const conversation: ConversationEntity = {
    sourceId: props.from,
    conversationAttributes: {
      phoneNumberId: props.phoneID,
    },
    contact: {
      sourceId: props.from,
      firstName: props.name,
    },
  }
  let postbackAction: string | null = null

  switch (props.message.type) {
    case "text":
      message.content = (props.message as ServerTextMessage).text.body
      break
    case "audio": {
      const attached = (props.message as ServerAudioMessage).audio
      const mediaSpecs = await fetchMedia(ctx, whatsappClient, attached.id)

      message.attachments = [
        {
          sourceId: attached.id,
          mimeType: attached.mime_type,
          fileType: FileType.audio,
          ...mediaSpecs,
        },
      ]
      break
    }
    case "document": {
      const attached = (props.message as ServerDocumentMessage).document
      const mediaSpecs = await fetchMedia(ctx, whatsappClient, attached.id)

      message.content = attached.caption
      message.attachments = [
        {
          name: attached.filename,
          sourceId: attached.id,
          mimeType: attached.mime_type,
          fileType: FileType.file,
          ...mediaSpecs,
        },
      ]
      break
    }
    case "image": {
      const attached = (props.message as ServerImageMessage).image
      const mediaSpecs = await fetchMedia(ctx, whatsappClient, attached.id)

      message.content = attached.caption
      message.attachments = [
        {
          sourceId: attached.id,
          mimeType: attached.mime_type,
          fileType: FileType.image,
          ...mediaSpecs,
        },
      ]

      break
    }
    case "sticker": {
      const attached = (props.message as ServerStickerMessage).sticker
      const mediaSpecs = await fetchMedia(ctx, whatsappClient, attached.id)

      message.attachments = [
        {
          sourceId: attached.id,
          mimeType: attached.mime_type,
          fileType: FileType.image,
          ...mediaSpecs,
        },
      ]
      break
    }
    case "video": {
      const attached = (props.message as ServerVideoMessage).video
      const mediaSpecs = await fetchMedia(ctx, whatsappClient, attached.id)

      message.attachments = [
        {
          sourceId: attached.id,
          mimeType: attached.mime_type,
          fileType: FileType.video,
          ...mediaSpecs,
        },
      ]
      break
    }
    case "location": {
      const attached = (props.message as ServerLocationMessage).location
      // message.contentType = ContentType.location
      message.content =
        [attached.name, attached.address]
          .filter((v) => Boolean(v))
          .join(": ") ?? "Received location"
      message.contentAttributes = attached
      break
    }
    case "contacts": {
      message.content = "Received contacts"
      message.contentAttributes = (
        props.message as ServerContactsMessage
      ).contacts
      break
    }
    case "interactive": {
      switch (props.message.interactive.type) {
        case "button_reply": {
          message.content = props.message.interactive.button_reply.title
          postbackAction = props.message.interactive.button_reply.id
          break
        }
        case "list_reply":
          message.contentAttributes = props.message.interactive.list_reply
          break
        case "nfm_reply":
          message.content = props.message.interactive.nfm_reply.body
          break
        default:
          message.content = "Received interactive (coming soon)"
          break
      }
      break
    }
    case "button": {
      const attached = (props.message as ServerButtonMessage).button
      message.content = attached.text
      break
    }
    case "order": {
      message.contentAttributes = (props.message as ServerOrderMessage).order
      break
    }
    // case "request_welcome": do nothing
    // case "reaction": do nothing
    // case "system": do nothing
    default:
      message.content = `Received ${props.message.type}`
      break
  }

  return {
    message,
    conversation,
    postbackAction,
    quickReplyAction: null,
    ref: null,
  }
}

export const fetchMedia = async (
  ctx: Context<WhatsappAuthValue>,
  whatsappClient: WhatsAppAPI,
  mediaId: string,
): Promise<ExternalMediaResult> => {
  try {
    const mediaResponse = await whatsappClient.retrieveMedia(mediaId)
    if ("url" in mediaResponse && "mime_type" in mediaResponse) {
      // we don't use whatsappClient.fetchMedia
      // big thanks for: https://stackoverflow.com/questions/77846881/cannot-download-media-from-whatsapp-business-api-working-with-postman-and-curl#answer-77872700
      const response = await fetch(mediaResponse.url, {
        headers: {
          Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
          "User-Agent": "node",
        },
      })
      if (response.ok && response.body) {
        const result: ExternalMediaResult = {
          originPath: `public/chatbots/${ctx.chatbot?.id ?? ""}/${createId()}`,
          size: Number.parseInt(
            response.headers.get("content-length") ?? "0",
            10,
          ),
        }

        const bytes = await response.arrayBuffer()
        const arrayBytes = new Uint8Array(bytes)

        const mimeType = mediaResponse.mime_type
        if (mimeType.startsWith("image/")) {
          // Retrieve width / height
          const dimensions = imageSize(arrayBytes)
          result.width = dimensions.width
          result.height = dimensions.height
        }

        await ctx.uploader?.putObject(result.originPath, Buffer.from(bytes), {
          ACL: "public-read",
          ContentLength: result.size,
          ContentType: mimeType,
        })

        return result
      }
    }

    logger.error({ mediaId, mediaResponse }, "Unable to fetch media:")

    throw new SdkException("Unable to download media")
  } catch (error) {
    logger.error(error, "Unable to fetch media info:")

    throw new SdkException("Unable to fetch media info")
  }
}
