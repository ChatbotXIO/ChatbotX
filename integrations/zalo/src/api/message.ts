import {
  type Context,
  guessFileTypeFromMimeType,
  type IncomingAttachment,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { fetch } from "cross-fetch"
import imageSize from "image-size"
import { ZALO_API_ENDPOINTS } from "../constants"
import { handleZaloError, ZaloException } from "../lib/exception"
import { ZaloHttpClient } from "../lib/http-client"
import type { ZaloAuthValue } from "../schema/definition"
import type {
  MessageAttachment,
  UploadAttachmentResponse,
  ZaloSendMessageRequest,
  ZaloSendMessageResponse,
} from "../schema/webhook"

export const sendMessageToZaloOA = (
  auth: ZaloAuthValue,
  payload: ZaloSendMessageRequest,
): Promise<ZaloSendMessageResponse> =>
  handleZaloError("Send message", async () => {
    const client = ZaloHttpClient.createAuthenticatedClient(
      auth.tokens.accessToken,
    )

    return await client.post<ZaloSendMessageResponse>(
      ZALO_API_ENDPOINTS.OA.SEND_MESSAGE,
      {
        json: payload,
      },
    )
  })

export const getMessageAttachmentEntity = ({
  ctx,
  attachment,
}: {
  ctx: Context<ZaloAuthValue>
  attachment: MessageAttachment
}): Promise<IncomingAttachment | undefined> =>
  handleZaloError("Get message attachment", async () => {
    if (!attachment.payload.url) {
      throw new ZaloException("No attachment URL found")
    }

    const response = await fetch(attachment.payload.url, {
      headers: {
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
        "User-Agent": "Mozilla/5.0 (compatible; ChatbotX/1.0)",
      },
    })

    if (!response.ok) {
      throw new ZaloException(`Failed to fetch attachment: ${response.status}`)
    }

    if (!response.body) {
      throw new ZaloException("No response body received")
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
  })

export const uploadAttachment = (
  auth: ZaloAuthValue,
  uploadType: "image" | "file" | "gif",
  url: string,
): Promise<UploadAttachmentResponse> =>
  handleZaloError("Upload attachment", async () => {
    const response = await fetch(url)

    if (!response.ok) {
      throw new ZaloException(`Failed to fetch file: ${response.status}`)
    }

    const contentType = response.headers.get("content-type")
    if (!contentType) {
      throw new ZaloException("No content-type header received")
    }

    const buffer = await response.arrayBuffer()
    const imageProperties: { width?: number; height?: number } = {}
    if (contentType?.startsWith("image/")) {
      const dimensions = imageSize(new Uint8Array(buffer))
      imageProperties.width = dimensions.width
      imageProperties.height = dimensions.height
    }

    const uint8 = new Uint8Array(buffer)

    const form = new FormData()
    form.append("file", new Blob([uint8], { type: contentType }))

    const client = ZaloHttpClient.createAuthenticatedClient(
      auth.tokens.accessToken,
    )

    let endpoint = ""
    switch (uploadType) {
      case "image":
        endpoint = ZALO_API_ENDPOINTS.OA.UPLOAD_IMAGE
        break
      case "file":
        endpoint = ZALO_API_ENDPOINTS.OA.UPLOAD_FILE
        break
      case "gif":
        endpoint = ZALO_API_ENDPOINTS.OA.UPLOAD_GIF
        break
      default:
        throw new ZaloException("Invalid upload type")
    }

    const result = await client.post<UploadAttachmentResponse>(endpoint, {
      body: form,
      headers: {
        "Content-Type": undefined,
      },
    })

    if (result.error && result.error !== 0) {
      throw new ZaloException(
        result.message || "Zalo OA upload file failed",
      ).setOriginError({
        response: {
          error: result,
        },
      })
    }

    return {
      ...result,
      ...imageProperties,
    }
  })
