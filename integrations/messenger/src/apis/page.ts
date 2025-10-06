import { type AttachmentEntity, type Context, FileType } from "@aha.chat/sdk"
import { createId } from "@paralleldrive/cuid2"
import imageSize from "image-size"
import ky from "ky"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { MessengerException } from "../exception"
import { logger } from "../lib/logger"
import type {
  FacebookMessageAttachment,
  FacebookSendMessageRequest,
  FacebookSendMessageResponse,
  MessengerAuthValue,
} from "../schemas"

export const PAGE_SUBSCRIBE_SCOPES = [
  "messages",
  "messaging_postbacks",
  "messaging_optins",
  "message_reads",
  "messaging_referrals",
  "message_echoes",
  "messaging_customer_information",
  "messaging_feedback",
  "messaging_policy_enforcement",
  "feed",
  "inbox_labels",
  "live_videos",
  "standby",
]

export const exchangeLongLivedToken = async (
  settings: {
    clientId: string
    clientSecret: string
    version?: string
  },
  accessToken: string,
): Promise<string> => {
  const { version = DEFAULT_API_VERSION } = settings

  const res: { access_token: string } = await ky
    .get(`${API_URL}/${version}/oauth/access_token`, {
      searchParams: {
        grant_type: "fb_exchange_token",
        client_id: settings.clientId as string,
        client_secret: settings.clientSecret as string,
        fb_exchange_token: accessToken,
      },
    })
    .json()

  return res.access_token
}

export const subscribePageToAppWebhook = async (props: {
  pageId: string
  accessToken: string
  version?: string
}): Promise<void> => {
  const { version = DEFAULT_API_VERSION } = props

  await ky.post(`${API_URL}/${version}/${props.pageId}/subscribed_apps`, {
    json: {
      subscribed_fields: PAGE_SUBSCRIBE_SCOPES.join(","),
      access_token: props.accessToken,
    },
  })
}

export const unsubscribePageFromAppWebhook = async (props: {
  pageId: string
  accessToken: string
  version?: string
}): Promise<void> => {
  const { version = DEFAULT_API_VERSION } = props

  try {
    await ky
      .delete(`${API_URL}/${version}/${props.pageId}/subscribed_apps`, {
        searchParams: { access_token: props.accessToken },
      })
      .json()
  } catch (error) {
    logger.error("Unsubscribe Page From AppWebhook failed", error)
    throw new MessengerException("Unsubscribe Page From AppWebhook failed")
  }
}

export const sendMessage = async (
  auth: MessengerAuthValue,
  payload: FacebookSendMessageRequest,
): Promise<FacebookSendMessageResponse> => {
  const { version = DEFAULT_API_VERSION } = auth

  try {
    return await ky
      .post(`${API_URL}/${version}/${auth.metadata.pageId}/messages`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.tokens.accessToken}`,
        },
        json: payload,
      })
      .json()
  } catch (error) {
    logger.error("Send Message error", error)
    throw new MessengerException("An error occurred while sending the message")
  }
}

export const getMessageAttachmentEntity = async ({
  ctx,
  attachment,
}: {
  ctx: Context<MessengerAuthValue>
  attachment: FacebookMessageAttachment
}): Promise<AttachmentEntity | undefined> => {
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

export const guessFileTypeFromMimeType = (attachmentType: string) => {
  switch (attachmentType) {
    case "image":
      return FileType.IMAGE
    case "video":
      return FileType.VIDEO
    case "audio":
      return FileType.AUDIO
    default:
      return FileType.DOCUMENT
  }
}
