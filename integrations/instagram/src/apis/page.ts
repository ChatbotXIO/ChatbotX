import type { Context } from "@chatbotx.io/sdk"
import { DEFAULT_API_VERSION } from "../constants"
import { InstagramAPIException, rescue } from "../exception"
import { instagramBusinessClient } from "../lib/http-client"
import type { InstagramAuthValue, InstagramProfileRequest } from "../schema"

export const INSTAGRAM_SUBSCRIBE_FIELDS = [
  "messages",
  "messaging_postbacks",
  "messaging_optins",
  "messaging_seen",
  "messaging_referral",
  "comments",
]

export type InstagramRefreshTokenResponse = {
  access_token: string
  expires_in: number
}

export const refreshLongLivedToken = (
  accessToken: string,
): Promise<InstagramRefreshTokenResponse> => {
  const endpoint = "refresh_access_token"

  return rescue(endpoint, () =>
    instagramBusinessClient.get<InstagramRefreshTokenResponse>(endpoint, {
      searchParams: {
        grant_type: "ig_refresh_token",
        access_token: accessToken,
      },
    }),
  )
}

export const getAccountPictureUrl = async (props: {
  ctx: Context<InstagramAuthValue>
}): Promise<string | undefined> => {
  const { ctx } = props
  const version = ctx.auth.metadata.version ?? DEFAULT_API_VERSION
  const accessToken = ctx.auth.tokens.accessToken
  const endpoint = `${version}/me`

  try {
    return await rescue(endpoint, async () => {
      const res: { profile_picture_url?: string } =
        await instagramBusinessClient.get(endpoint, {
          searchParams: {
            fields: "profile_picture_url",
            access_token: accessToken,
          },
        })
      return res.profile_picture_url
    })
  } catch {
    return
  }
}

export const subscribePageToInstagramWebhook = (props: {
  igId: string
  accessToken: string
  version?: string
}): Promise<void> => {
  const { version = DEFAULT_API_VERSION } = props
  const endpoint = `${version}/${props.igId}/subscribed_apps`
  const subscribedFields = INSTAGRAM_SUBSCRIBE_FIELDS.join(",")

  return rescue(endpoint, async () => {
    const response = await instagramBusinessClient.post<{ success?: boolean }>(
      endpoint,
      {
        headers: {
          Authorization: `Bearer ${props.accessToken}`,
        },
        json: {
          subscribed_fields: subscribedFields,
        },
      },
    )
    if (response.success !== true) {
      throw new InstagramAPIException(
        `Subscribe failed for Instagram page ${props.igId}`,
      )
    }
  })
}

export const unsubscribePageFromInstagramWebhook = (props: {
  igId: string
  accessToken: string
  version?: string
}): Promise<void> => {
  const { version = DEFAULT_API_VERSION } = props
  const endpoint = `${version}/${props.igId}/subscribed_apps`

  return rescue(endpoint, async () => {
    const response = await instagramBusinessClient.delete<{
      success?: boolean
    }>(endpoint, {
      headers: {
        Authorization: `Bearer ${props.accessToken}`,
      },
    })
    if (response.success !== true) {
      throw new InstagramAPIException(
        `Unsubscribe failed for Instagram page ${props.igId}`,
      )
    }
  })
}

export const deleteProfileFields = (props: {
  ctx: Context<InstagramAuthValue>
  fields: string[]
}): Promise<void> => {
  const { ctx, fields } = props
  const version = ctx.auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/me/messenger_profile`

  return rescue(endpoint, () =>
    instagramBusinessClient.delete(endpoint, {
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

export const updateProfile = (props: {
  ctx: Context<InstagramAuthValue>
  params: InstagramProfileRequest
}): Promise<void> => {
  const { ctx, params } = props
  const version = ctx.auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/me/messenger_profile`

  return rescue(endpoint, () => {
    const queries = new URLSearchParams({
      platform: "instagram",
      access_token: ctx.auth.tokens.accessToken,
    }).toString()

    return instagramBusinessClient.post(`${endpoint}?${queries}`, {
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

export const getPersistentMenu = (props: {
  ctx: Context<InstagramAuthValue>
}): Promise<{
  persistentMenu?: InstagramProfileRequest["persistent_menu"]
}> => {
  const { ctx } = props
  const version = ctx.auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/me/messenger_profile`

  return rescue(endpoint, async () => {
    const queries = new URLSearchParams({
      platform: "instagram",
      access_token: ctx.auth.tokens.accessToken,
      fields: "persistent_menu",
    }).toString()

    const response: {
      persistent_menu?: InstagramProfileRequest["persistent_menu"]
    } = await instagramBusinessClient.get(`${endpoint}?${queries}`, {
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
  const version = ctx.auth.metadata.version ?? DEFAULT_API_VERSION

  const { persistentMenu } = await getPersistentMenu({ ctx })

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
      instagramBusinessClient.post(`${endpoint}?${queries}`, {
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
    instagramBusinessClient.post(`${endpoint}?${queries}`, {
      headers: { "Content-Type": "application/json" },
      json: {
        platform: "instagram",
        persistent_menu: updatedMenu,
      },
    }),
  )
}
