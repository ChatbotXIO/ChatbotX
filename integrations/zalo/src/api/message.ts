import { type AttachmentEntity, type Context, FileType } from "@aha.chat/sdk"
import { createId } from "@paralleldrive/cuid2"
import imageSize from "image-size"
import { ZaloException } from "../exceptions"
import { ZaloHttpClient } from "../libs/http-client"
import type { ZaloAuthValue } from "../schemas/definition"
import type {
  MessageAttachment,
  UploadAttachmentResponse,
  ZaloSendMessageRequest,
  ZaloSendMessageResponse,
} from "../schemas/webhook"

export const sendMessage = async (
  auth: ZaloAuthValue,
  payload: ZaloSendMessageRequest,
): Promise<ZaloSendMessageResponse> => {
  try {
    const client = ZaloHttpClient.createAuthenticatedClient(
      auth.tokens.accessToken,
    )

    return await client.post<ZaloSendMessageResponse>("v3.0/oa/message/cs", {
      json: payload,
    })
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred"

    throw new ZaloException(`Zalo send message failed: ${errorMessage}`)
  }
}

export const getMessageAttachmentEntity = async ({
  ctx,
  attachment,
}: {
  ctx: Context<ZaloAuthValue>
  attachment: MessageAttachment
}): Promise<AttachmentEntity | undefined> => {
  if (!attachment.payload.url) {
    throw new ZaloException("No attachment URL found")
  }

  try {
    const response = await fetch(attachment.payload.url, {
      headers: {
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
        "User-Agent": "Mozilla/5.0 (compatible; AhaChat/1.0)",
        Accept: "*/*",
        "Cache-Control": "no-cache",
      },
    })

    if (!response.ok) {
      throw new ZaloException(`Failed to fetch attachment: ${response.status}`)
    }

    if (!response.body) {
      throw new ZaloException("No response body received")
    }

    const originPath = `public/chatbots/${ctx.chatbot?.id ?? ""}/${createId()}`
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
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred"

    throw new ZaloException(`Get message attachment failed: ${errorMessage}`)
  }
}

export const guessFileTypeFromMimeType = (attachmentType: string) => {
  switch (attachmentType) {
    case "image":
    case "sticker":
      return FileType.IMAGE
    default:
      return FileType.DOCUMENT
  }
}

export const uploadAttachment = async (
  auth: ZaloAuthValue,
  uploadType: "image" | "file",
  url: string,
): Promise<UploadAttachmentResponse> => {
  try {
    const response = await fetch(url)

    if (!response.ok) {
      throw new ZaloException(`Failed to fetch file: ${response.status}`)
    }

    const contentType = response.headers.get("content-type")
    if (!contentType) {
      throw new ZaloException("No content-type header received")
    }

    const buffer = await response.arrayBuffer()
    const uint8 = new Uint8Array(buffer)

    const form = new FormData()
    form.append("file", new Blob([uint8], { type: contentType }))

    const client = ZaloHttpClient.createAuthenticatedClient(
      auth.tokens.accessToken,
    )

    const result = await client.post<UploadAttachmentResponse>(
      `v2.0/oa/upload/${uploadType}`,
      {
        body: form,
        headers: {
          "Content-Type": undefined,
        },
      },
    )

    if (result.error && result.error !== 0) {
      throw new ZaloException(result.message || "Zalo upload file failed")
    }

    return result
  } catch (error) {
    if (error instanceof ZaloException) {
      throw error
    }

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred"

    throw new ZaloException(`Upload attachment failed: ${errorMessage}`)
  }
}
