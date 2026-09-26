import {
  type Context,
  type FileType,
  guessFileTypeFromMimeType,
  type IncomingAttachment,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import fetch from "cross-fetch"
import imageSize from "image-size"
import { rescue } from "../exception"
import { instagramBusinessClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type {
  InstagramAttachment,
  InstagramAuthValue,
  InstagramMessageAttachment,
  InstagramSendMessageResponse,
} from "../schema"

export const uploadAttachment = (
  auth: InstagramAuthValue,
  url: string,
  type: FileType,
): Promise<InstagramSendMessageResponse> => {
  const endpoint = `${auth.metadata.version}/${auth.metadata.pageId}/message_attachments`

  return rescue(endpoint, () =>
    instagramBusinessClient.post<InstagramSendMessageResponse>(endpoint, {
      headers: {
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
      json: {
        platform: "instagram",
        message: {
          attachment: {
            type,
            payload: {
              url,
              is_reusable: true,
            } as InstagramMessageAttachment["payload"],
          },
        },
      },
    }),
  )
}

export const getMessageAttachmentEntity = async ({
  ctx,
  attachment,
}: {
  ctx: Context<InstagramAuthValue>
  attachment: InstagramAttachment
}): Promise<IncomingAttachment | undefined> => {
  if (!attachment.payload.url) {
    throw new Error("No attachment URL found")
  }
  const response = await fetch(attachment.payload.url as string, {
    headers: {
      Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      "User-Agent": "node",
    },
  })
  if (!(response.ok && response.body)) {
    throw new Error(
      `Failed to download attachment (status ${response.status} ${response.statusText}): ${attachment.payload.url}`,
    )
  }

  const originPath = `${ctx.storagePrefix}/${createId()}`
  const bytes = await response.arrayBuffer()
  const mimeType = response.headers.get("content-type") ?? "image/png"
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
    try {
      const arrayBytes = new Uint8Array(bytes)
      const dimensions = imageSize(arrayBytes)
      imageProperties.width = dimensions.width
      imageProperties.height = dimensions.height
    } catch (error) {
      logger.warn(error, "Failed to read attachment image dimensions")
    }
  }

  return {
    sourceId: createId(),
    originPath,
    fileType,
    mimeType,
    size: Number.parseInt(response.headers.get("content-length") ?? "0", 10),
    ...imageProperties,
  }
}
