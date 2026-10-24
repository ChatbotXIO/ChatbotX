import type { FileType } from "@chatbotx.io/sdk"
import {
  type Context,
  getMediaStoragePrefix,
  guessFileTypeFromMimeType,
  type IncomingAttachment,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import {
  storeIncomingImage,
  toStoredMediaFields,
} from "@chatbotx.io/utils/store-incoming-image"
import fetch from "cross-fetch"
import { rescue } from "../exception"
import { facebookAttachmentClient } from "../lib/http-client"
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
  authorize = true,
  requireMedia = false,
}: {
  ctx: Context<MessengerAuthValue>
  attachment: MessengerAttachment
  // False for a URL outside Facebook's CDN, so the page token never leaks to a
  // third-party host.
  authorize?: boolean
  // Rejects a non image/video response (e.g. an HTML landing page) before it
  // is uploaded to storage.
  requireMedia?: boolean
}): Promise<IncomingAttachment | undefined> => {
  if (!attachment.payload.url) {
    throw new Error("No attachment URL found")
  }
  const response = await fetch(attachment.payload.url as string, {
    headers: {
      ...(authorize
        ? { Authorization: `Bearer ${ctx.auth.tokens.accessToken}` }
        : {}),
      "User-Agent": "node",
    },
  })
  if (!(response.ok && response.body)) {
    throw new Error(
      `Failed to download attachment (status ${response.status} ${response.statusText}): ${attachment.payload.url}`,
    )
  }

  const mimeType = response.headers.get("content-type") ?? "image/png"
  const fileType = guessFileTypeFromMimeType(mimeType)
  if (requireMedia && fileType !== "image" && fileType !== "video") {
    throw new Error(
      `Attachment is not an image or video (${mimeType}): ${attachment.payload.url}`,
    )
  }

  const isPhotoMessage = attachment.type === "image"
  const stored = await storeIncomingImage({
    uploader: ctx.uploader,
    key: `${getMediaStoragePrefix(ctx)}/${createId()}`,
    bytes: await response.arrayBuffer(),
    mimeType,
    profile: isPhotoMessage ? "media" : "original",
    acl: "public-read",
  })

  return {
    sourceId: createId(),
    isPhotoMessage,
    fileType,
    ...toStoredMediaFields(stored),
  }
}
