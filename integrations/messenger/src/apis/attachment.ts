import type { FileType } from "@chatbotx.io/sdk"
import {
  type Context,
  guessFileTypeFromMimeType,
  type IncomingAttachment,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { fetchMediaWithLimits } from "@chatbotx.io/utils/media-download"
import imageSize from "image-size"
import { rescue } from "../exception"
import { facebookAttachmentClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type {
  FacebookMessageAttachment,
  FacebookSendMessageResponse,
  MessengerAttachment,
  MessengerAuthValue,
} from "../schema"

export const uploadAttachment = (
  auth: MessengerAuthValue,
  url: string,
  type: FileType,
): Promise<FacebookSendMessageResponse> => {
  const endpoint = `${auth.metadata.version}/me/message_attachments`

  return rescue(endpoint, () =>
    facebookAttachmentClient.post<FacebookSendMessageResponse>(endpoint, {
      headers: {
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
      json: {
        message: {
          attachment: {
            type,
            payload: {
              is_reusable: true,
              url,
            } as FacebookMessageAttachment["payload"],
          },
        },
      },
    }),
  )
}

export const getMessageAttachmentEntity = async ({
  ctx,
  attachment,
  sourceId = createId(),
  download,
}: {
  ctx: Context<MessengerAuthValue>
  attachment: MessengerAttachment
  sourceId?: string
  download?: { timeoutMs: number; maxBytes: number }
}): Promise<IncomingAttachment | undefined> => {
  if (!attachment.payload.url) {
    throw new Error("No attachment URL found")
  }
  const headers = {
    Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
    "User-Agent": "node",
  }

  let bytes: ArrayBuffer
  let mimeType: string
  let size: number
  if (download) {
    const media = await fetchMediaWithLimits(attachment.payload.url, {
      headers,
      ...download,
    })
    if (!media) {
      logger.warn(
        {
          err: new Error(
            `Failed to download attachment: ${attachment.payload.url}`,
          ),
        },
        "Attachment download returned no usable media",
      )
      return
    }
    bytes = media.bytes
    mimeType = media.mimeType
    size = bytes.byteLength
  } else {
    const response = await fetch(attachment.payload.url, { headers })
    if (!(response.ok && response.body)) {
      throw new Error(
        `Failed to download attachment (status ${response.status} ${response.statusText}): ${attachment.payload.url}`,
      )
    }
    bytes = await response.arrayBuffer()
    mimeType = response.headers.get("content-type") ?? "image/png"
    size = Number.parseInt(response.headers.get("content-length") ?? "0", 10)
  }

  const originPath = `${ctx.storagePrefix}/${createId()}`
  const fileType = guessFileTypeFromMimeType(mimeType)

  await ctx.uploader?.putObject(originPath, Buffer.from(bytes), {
    ACL: "public-read",
    ContentType: mimeType,
  })

  const imageProperties: {
    width?: number
    height?: number
  } = {}
  if (mimeType.startsWith("image/")) {
    // Retrieve width / height
    try {
      const arrayBytes = new Uint8Array(bytes)
      const dimensions = imageSize(arrayBytes)
      imageProperties.width = dimensions.width
      imageProperties.height = dimensions.height
    } catch (error) {
      logger.warn({ err: error }, "Failed to read attachment image dimensions")
    }
  }

  return {
    sourceId,
    originPath,
    fileType,
    mimeType,
    size,
    ...imageProperties,
  }
}
