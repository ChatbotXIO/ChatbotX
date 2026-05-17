import {
  type Context,
  guessFileTypeFromMimeType,
  type IncomingAttachment,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import fetch from "cross-fetch"
import imageSize from "image-size"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { instagramGraphClient } from "../lib/http-client"
import type {
  InstagramAuthValue,
  InstagramMessageAttachment,
  InstagramProfileRequest,
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

export const exchangeLongLivedToken = (
  settings: {
    clientId: string
    clientSecret: string
    version?: string
  },
  accessToken: string,
): Promise<string> => {
  const { version = DEFAULT_API_VERSION } = settings
  const endpoint = `${version}/oauth/access_token`

  return rescue(endpoint, async () => {
    const res: { access_token: string } = await instagramGraphClient.get(
      endpoint,
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
  })
}

export const subscribePageToInstagramWebhook = (props: {
  pageId: string
  accessToken: string
  version?: string
}): Promise<void> => {
  const { version = DEFAULT_API_VERSION } = props
  const endpoint = `${version}/${props.pageId}/subscribed_apps`

  return rescue(endpoint, () =>
    instagramGraphClient.post(endpoint, {
      headers: {
        Authorization: `Bearer ${props.accessToken}`,
      },
      json: {
        subscribed_fields: INSTAGRAM_SUBSCRIBE_FIELDS.join(","),
      },
    }),
  )
}

export const unsubscribePageFromInstagramWebhook = (props: {
  auth: InstagramAuthValue
}): Promise<void> => {
  const { version = DEFAULT_API_VERSION } = props.auth
  const endpoint = `${version}/${props.auth.metadata.pageId}/subscribed_apps`

  return rescue(endpoint, () =>
    instagramGraphClient.delete(endpoint, {
      headers: {
        Authorization: `Bearer ${props.auth.tokens.accessToken}`,
      },
    }),
  )
}

export const sendInstagramMessage = (
  auth: InstagramAuthValue,
  payload: InstagramSendMessageRequest,
): Promise<InstagramSendMessageResponse> => {
  const { version = DEFAULT_API_VERSION } = auth
  const endpoint = `${version}/me/messages`

  return rescue(endpoint, () =>
    instagramGraphClient.post<InstagramSendMessageResponse>(endpoint, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
      json: payload,
    }),
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

export const deleteInstagramProfileFields = (props: {
  ctx: Context<InstagramAuthValue>
  fields: string[]
}): Promise<void> => {
  const { ctx, fields } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const endpoint = `${version}/me/messenger_profile`

  return rescue(endpoint, () =>
    instagramGraphClient.delete(endpoint, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
      json: {
        platform: "instagram",
        fields,
      },
    }),
  )
}

export const updateInstagramProfile = (props: {
  ctx: Context<InstagramAuthValue>
  params: InstagramProfileRequest
}): Promise<void> => {
  const { ctx, params } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const endpoint = `${version}/me/messenger_profile`

  return rescue(endpoint, () => {
    const queries = new URLSearchParams({
      platform: "instagram",
      access_token: ctx.auth.tokens.accessToken,
    }).toString()

    return instagramGraphClient.post(`${endpoint}?${queries}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
      json: {
        platform: "instagram",
        ...params,
      },
    })
  })
}

export const getInstagramPersistentMenu = (props: {
  ctx: Context<InstagramAuthValue>
}): Promise<{
  persistentMenu?: InstagramProfileRequest["persistent_menu"]
}> => {
  const { ctx } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const endpoint = `${version}/me/messenger_profile`

  return rescue(endpoint, async () => {
    const queries = new URLSearchParams({
      platform: "instagram",
      access_token: ctx.auth.tokens.accessToken,
      fields: "persistent_menu",
    }).toString()

    const response: {
      persistent_menu?: InstagramProfileRequest["persistent_menu"]
    } = await instagramGraphClient.get(`${endpoint}?${queries}`, {
      headers: {
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
    })

    return { persistentMenu: response.persistent_menu }
  })
}

export const addBranding = async (props: {
  ctx: Context<InstagramAuthValue>
  title: string
  url: string
}): Promise<void> => {
  const { ctx } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth

  const { persistentMenu } = await getInstagramPersistentMenu({ ctx })

  const queries = new URLSearchParams({
    platform: "instagram",
    access_token: ctx.auth.tokens.accessToken,
  }).toString()

  const brandingAction = {
    type: "web_url" as const,
    title: props.title,
    url: props.url,
  }

  const endpoint = `${version}/me/messenger_profile`

  if (!persistentMenu || persistentMenu.length === 0) {
    await rescue(endpoint, () =>
      instagramGraphClient.post(`${endpoint}?${queries}`, {
        headers: { "Content-Type": "application/json" },
        json: {
          platform: "instagram",
          persistent_menu: [
            {
              locale: "default",
              call_to_actions: [brandingAction],
            },
          ],
        },
      }),
    )
    return
  }

  const hasBranding = persistentMenu.some((menu) =>
    menu.call_to_actions?.some(
      (action) =>
        action.type === "web_url" &&
        action.url === props.url &&
        action.title === props.title,
    ),
  )

  if (hasBranding) {
    return
  }

  const updatedMenu = persistentMenu.map((menu, index) => {
    if (index === 0) {
      return {
        ...menu,
        call_to_actions: [...(menu.call_to_actions || []), brandingAction],
      }
    }
    return menu
  })

  await rescue(endpoint, () =>
    instagramGraphClient.post(`${endpoint}?${queries}`, {
      headers: { "Content-Type": "application/json" },
      json: {
        platform: "instagram",
        persistent_menu: updatedMenu,
      },
    }),
  )
}
