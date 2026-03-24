import {
  type Context,
  guessFileTypeFromMimeType,
  type IncomingAttachment,
} from "@aha.chat/sdk"
import { createId } from "@paralleldrive/cuid2"
import fetch from "cross-fetch"
import imageSize from "image-size"
import { DEFAULT_API_VERSION } from "../constants"
import { InstagramAPIException } from "../exception"
import { instagramGraphClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type {
  InstagramAuthValue,
  InstagramIceBreakersRequest,
  InstagramMessageAttachment,
  InstagramPersistentMenuRequest,
  InstagramSendMessageRequest,
  InstagramSendMessageResponse,
} from "../schemas"

export const INSTAGRAM_SUBSCRIBE_FIELDS = [
  "messages",
  "messaging_postbacks",
  "messaging_optins",
  "message_reads",
  "messaging_referrals",
  "message_echoes",
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

  const res: { access_token: string } = await instagramGraphClient.get(
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

export const subscribePageToInstagramWebhook = async (props: {
  pageId: string
  accessToken: string
  version?: string
}): Promise<void> => {
  const { version = DEFAULT_API_VERSION } = props

  await instagramGraphClient.post(
    `${version}/${props.pageId}/subscribed_apps`,
    {
      headers: {
        Authorization: `Bearer ${props.accessToken}`,
      },
      json: {
        subscribed_fields: INSTAGRAM_SUBSCRIBE_FIELDS.join(","),
      },
    },
  )
}

export const unsubscribePageFromInstagramWebhook = async (props: {
  pageId: string
  accessToken: string
  version?: string
}): Promise<void> => {
  const { version = DEFAULT_API_VERSION } = props

  try {
    await instagramGraphClient.delete(
      `${version}/${props.pageId}/subscribed_apps`,
      {
        headers: {
          Authorization: `Bearer ${props.accessToken}`,
        },
      },
    )
  } catch (error) {
    logger.error(error, "Unsubscribe Page From Instagram Webhook failed")
    throw new InstagramAPIException(
      "Unsubscribe Page From Instagram Webhook failed",
      `${version}/${props.pageId}/subscribed_apps`,
    )
  }
}

export const sendInstagramMessage = async (
  auth: InstagramAuthValue,
  payload: InstagramSendMessageRequest,
): Promise<InstagramSendMessageResponse> => {
  const { version = DEFAULT_API_VERSION } = auth

  return await instagramGraphClient.post<InstagramSendMessageResponse>(
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
  ctx: Context<InstagramAuthValue>
  attachment: InstagramMessageAttachment
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
  }
}

export const updateIceBreakers = async (props: {
  ctx: Context<InstagramAuthValue>
  params: InstagramIceBreakersRequest
}): Promise<void> => {
  const { ctx, params } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth

  await instagramGraphClient.post(`${version}/me/messenger_profile`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
    },
    json: {
      platform: "instagram",
      ice_breakers: params,
    },
  })
}

export const updatePersistentMenu = async (props: {
  ctx: Context<InstagramAuthValue>
  params: InstagramPersistentMenuRequest
}): Promise<void> => {
  const { ctx, params } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth

  if (params.length === 0) {
    await instagramGraphClient.delete(`${version}/me/messenger_profile`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
      json: {
        platform: "instagram",
        fields: ["persistent_menu"],
      },
    })
  } else {
    await instagramGraphClient.post(`${version}/me/messenger_profile`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
      json: {
        platform: "instagram",
        persistent_menu: [
          {
            locale: "default",
            composer_input_disabled: false,
            call_to_actions: params,
          },
        ],
      },
    })
  }
}
