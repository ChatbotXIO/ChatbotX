import type { FileType } from "@chatbotx.io/sdk"
import {
  type Context,
  guessFileTypeFromMimeType,
  type IncomingAttachment,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import fetch from "cross-fetch"
import imageSize from "image-size"
import { MessengerAttachmentException } from "../exception"
import { facebookAttachmentClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type {
  FacebookMessageAttachment,
  FacebookSendMessageResponse,
  MessengerAuthValue,
} from "../schema"

export const uploadAttachment = async (
  auth: MessengerAuthValue,
  url: string,
  type: FileType,
): Promise<FacebookSendMessageResponse> => {
  try {
    return await facebookAttachmentClient.post<FacebookSendMessageResponse>(
      `${auth.metadata.version}/me/message_attachments`,
      {
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
      },
    )
  } catch (error) {
    logger.error(error, "Upload attachment failed")
    throw new MessengerAttachmentException(
      "Upload attachment failed",
      url,
    ).setOriginError(error)
  }
}

export const getMessageAttachmentEntity = async ({
  ctx,
  attachment,
}: {
  ctx: Context<MessengerAuthValue>
  attachment: FacebookMessageAttachment
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
  if (response.ok && response.body) {
    const originPath = `${ctx.storagePrefix}/${createId()}`
    const bytes = await response.arrayBuffer()
    const mimeType = response.headers.get("content-type") ?? "image/png"
    const fileType = guessFileTypeFromMimeType(attachment.type)

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
      const arrayBytes = new Uint8Array(bytes)
      const dimensions = imageSize(arrayBytes)
      imageProperties.width = dimensions.width
      imageProperties.height = dimensions.height
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
}
