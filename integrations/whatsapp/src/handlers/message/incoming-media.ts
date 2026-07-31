import {
  type Context,
  type ExternalMediaResult,
  type FileType,
  type IncomingAttachment,
  SdkException,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import fetch from "cross-fetch"
import imageSize from "image-size"
import type { WhatsAppAPI } from "whatsapp-api-js"
import { logger } from "../../lib/logger"
import type { WhatsappAuthValue } from "../../schema"
import type {
  MessageParserDeps,
  WhatsappMessageParser,
} from "./message-parser-types"

const fetchMedia = async (
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
          originPath: `${ctx.storagePrefix}/${createId()}`,
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

/** Normalized view of a media payload, whatever its message type calls it. */
type MediaAttachmentSource = {
  readonly id: string
  readonly mimeType: string
  /** Surfaced as the message text. Only `document` and `image` do this today. */
  readonly caption?: string
  /** Only `document` carries one. */
  readonly filename?: string
}

/**
 * Shared by every media parser below: fetch the file, build the one
 * attachment. What differs per message type is only *which* fields to read
 * (see `MediaAttachmentSource` callers) — never this part.
 */
const readMediaReply = async (
  deps: MessageParserDeps,
  media: MediaAttachmentSource,
  fileType: FileType,
): Promise<{ text?: string; attachments: IncomingAttachment[] }> => {
  const mediaSpecs = await fetchMedia(deps.ctx, deps.whatsappClient, media.id)

  return {
    ...(media.caption === undefined ? {} : { text: media.caption }),
    attachments: [
      {
        ...(media.filename ? { name: media.filename } : {}),
        sourceId: media.id,
        mimeType: media.mimeType,
        fileType,
        ...mediaSpecs,
      },
    ],
  }
}

// An audio note has no caption field, and no text is surfaced for one.
export const parseAudioMessage: WhatsappMessageParser<"audio"> = (
  message,
  deps,
) =>
  readMediaReply(
    deps,
    { id: message.audio.id, mimeType: message.audio.mime_type },
    "audio",
  )

export const parseDocumentMessage: WhatsappMessageParser<"document"> = (
  message,
  deps,
) =>
  readMediaReply(
    deps,
    {
      id: message.document.id,
      mimeType: message.document.mime_type,
      caption: message.document.caption,
      filename: message.document.filename,
    },
    "file",
  )

export const parseImageMessage: WhatsappMessageParser<"image"> = (
  message,
  deps,
) =>
  readMediaReply(
    deps,
    {
      id: message.image.id,
      mimeType: message.image.mime_type,
      caption: message.image.caption,
    },
    "image",
  )

export const parseStickerMessage: WhatsappMessageParser<"sticker"> = (
  message,
  deps,
) =>
  readMediaReply(
    deps,
    { id: message.sticker.id, mimeType: message.sticker.mime_type },
    "image",
  )

export const parseVideoMessage: WhatsappMessageParser<"video"> = (
  message,
  deps,
) =>
  // `video.caption` EXISTS on the API type but is intentionally not read:
  // today's handler ignores it. Surfacing it would be a user-visible change
  // (captions appearing in the inbox), so it stays out on purpose.
  readMediaReply(
    deps,
    { id: message.video.id, mimeType: message.video.mime_type },
    "video",
  )
