import { Readable } from "node:stream"
import type { ReadableStream } from "node:stream/web"
import {
  ContentType,
  type Context,
  type ConversationEntity,
  type ExternalMediaResult,
  FileType,
  type MessageEntity,
  type MessageLocationEntity,
  SdkException,
} from "@ahachat.ai/sdk"
import imageSize from "image-size"
import type { WhatsAppAPI } from "whatsapp-api-js"
import type { OnMessageArgs } from "whatsapp-api-js/emitters"
import type {
  ServerAudioMessage,
  ServerButtonMessage,
  ServerContactsMessage,
  ServerDocumentMessage,
  ServerImageMessage,
  ServerInteractiveMessage,
  ServerLocationMessage,
  ServerOrderMessage,
  ServerStickerMessage,
  ServerTextMessage,
  ServerVideoMessage,
} from "whatsapp-api-js/types"
import type { WhatsappAuthValue } from "./schemas"

export const parseIncomingMessage = async (
  ctx: Context<WhatsappAuthValue>,
  whatsappClient: WhatsAppAPI,
  props: OnMessageArgs,
) => {
  const message: MessageEntity = {
    sourceId: props.message.id,
    contentType: ContentType.TEXT,
  }
  const conversation: ConversationEntity = {
    sourceId: props.from,
    conversationAttributes: {
      phoneNumberId: props.phoneID,
    },
    contact: {
      sourceId: props.from,
      name: props.name,
    },
  }

  switch (props.message.type) {
    case "text":
      message.content = (props.message as ServerTextMessage).text.body
      break
    case "audio": {
      const attached = (props.message as ServerAudioMessage).audio
      const mediaSpecs = await fetchMedia(
        ctx,
        whatsappClient,
        props.from,
        attached.id,
      )

      message.attachments = [
        {
          sourceId: attached.id,
          mimeType: attached.mime_type,
          fileType: FileType.AUDIO,
          ...mediaSpecs,
        },
      ]
      break
    }
    case "document": {
      const attached = (props.message as ServerDocumentMessage).document
      const mediaSpecs = await fetchMedia(
        ctx,
        whatsappClient,
        props.from,
        attached.id,
      )

      message.content = attached.caption
      message.attachments = [
        {
          name: attached.filename,
          sourceId: attached.id,
          mimeType: attached.mime_type,
          fileType: FileType.FILE,
          ...mediaSpecs,
        },
      ]
      break
    }
    case "image": {
      const attached = (props.message as ServerImageMessage).image
      const mediaSpecs = await fetchMedia(
        ctx,
        whatsappClient,
        props.from,
        attached.id,
      )

      message.content = attached.caption
      message.attachments = [
        {
          sourceId: attached.id,
          mimeType: attached.mime_type,
          fileType: FileType.IMAGE,
          ...mediaSpecs,
        },
      ]

      break
    }
    case "sticker": {
      const attached = (props.message as ServerStickerMessage).sticker
      const mediaSpecs = await fetchMedia(
        ctx,
        whatsappClient,
        props.from,
        attached.id,
      )

      message.attachments = [
        {
          sourceId: attached.id,
          mimeType: attached.mime_type,
          fileType: FileType.IMAGE,
          ...mediaSpecs,
        },
      ]
      break
    }
    case "video": {
      const attached = (props.message as ServerVideoMessage).video
      const mediaSpecs = await fetchMedia(
        ctx,
        whatsappClient,
        props.from,
        attached.id,
      )

      message.attachments = [
        {
          sourceId: attached.id,
          mimeType: attached.mime_type,
          fileType: FileType.VIDEO,
          ...mediaSpecs,
        },
      ]
      break
    }
    case "location": {
      const attached = (props.message as ServerLocationMessage).location
      message.contentAttributes = {
        latitude: attached.latitude,
        longitude: attached.longitude,
      } as MessageLocationEntity
      break
    }
    case "contacts": {
      message.content = "Received contacts (coming soon)"
      message.contentAttributes = (
        props.message as ServerContactsMessage
      ).contacts
      break
    }
    case "interactive": {
      message.content = "Received interactive (coming soon)"
      message.contentAttributes = (
        props.message as ServerInteractiveMessage
      ).interactive
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
    // case "system": do nothin
    default:
      break
  }

  return { message, conversation }
}

export const fetchMedia = async (
  ctx: Context<WhatsappAuthValue>,
  whatsappClient: WhatsAppAPI,
  conversationId: string,
  mediaId: string,
): Promise<ExternalMediaResult> => {
  try {
    const mediaResponse = await whatsappClient.retrieveMedia(mediaId)
    if ("url" in mediaResponse && "mime_type" in mediaResponse) {
      const response = await whatsappClient.fetchMedia(mediaResponse.url)
      if (response.ok && response.body) {
        const result: ExternalMediaResult = {
          originPath: `contacts/${conversationId}/${mediaId}`,
          size: Number.parseInt(response.headers.get("content-length") ?? "0"),
        }

        const mimeType = mediaResponse.mime_type
        if (mimeType.startsWith("image/")) {
          const clonedResponse = response.clone()
          const bytes = await clonedResponse.arrayBuffer()

          // Retrieve width / height
          const dimensions = imageSize(new Uint8Array(bytes))
          result.width = dimensions.width
          result.height = dimensions.height
        }

        await ctx.uploader?.putObject(
          result.originPath,
          Readable.fromWeb(
            response.body as unknown as ReadableStream<Uint8Array>,
          ),
          result.size,
          {
            "content-type": mimeType,
          },
        )

        return result
      }
    }

    ctx.logger.error("Unable to fetch media", { mediaId, mediaResponse })

    throw new SdkException("Unable to fetch media")
  } catch (error) {
    ctx.logger.error("Unable to fetch media", { error })

    throw new SdkException("Unable to fetch media")
  }
}
