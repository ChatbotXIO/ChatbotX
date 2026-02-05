import {
  type AttachmentEntity,
  type Context,
  guessFileTypeFromMimeType,
} from "@aha.chat/sdk"
import { createId } from "@paralleldrive/cuid2"
import fetch from "cross-fetch"
import imageSize from "image-size"
import { DEFAULT_API_VERSION } from "../constants"
import { MessengerAPIException } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
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

  const res: { access_token: string } = await facebookGraphClient.get(
    `${version}/oauth/access_token`,
    {
      searchParams: {
        grant_type: "fb_exchange_token",
        client_id: settings.clientId as string,
        client_secret: settings.clientSecret as string,
        fb_exchange_token: accessToken,
      },
    },
  )

  return res.access_token
}

export const subscribePageToAppWebhook = async (props: {
  pageId: string
  accessToken: string
  version?: string
}): Promise<void> => {
  const { version = DEFAULT_API_VERSION } = props

  await facebookGraphClient.post(`${version}/me/subscribed_apps`, {
    headers: {
      Authorization: `Bearer ${props.accessToken}`,
    },
    json: {
      subscribed_fields: PAGE_SUBSCRIBE_SCOPES.join(","),
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
    await facebookGraphClient.delete(`${version}/me/subscribed_apps`, {
      headers: {
        Authorization: `Bearer ${props.accessToken}`,
      },
    })
  } catch (error) {
    logger.error(error, "Unsubscribe Page From AppWebhook failed")
    throw new MessengerAPIException(
      "Unsubscribe Page From AppWebhook failed",
      `${version}/${props.pageId}/subscribed_apps`,
    )
  }
}

export const sendMessage = async (
  auth: MessengerAuthValue,
  payload: FacebookSendMessageRequest,
): Promise<FacebookSendMessageResponse> => {
  const { version = DEFAULT_API_VERSION } = auth

  return await facebookGraphClient.post<FacebookSendMessageResponse>(
    `${version}/me/messages`,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
      json: payload,
    },
  )
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
