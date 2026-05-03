import type { Context } from "@chatbotx.io/sdk"
import { DEFAULT_API_VERSION } from "../constants"
import { MessengerAPIException } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type {
  MessengerAuthValue,
  MessengerProfileRequest,
  PersonaRequest,
} from "../schema"

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
    ).setOriginError(error)
  }
}

export const updateMessengerProfile = async (props: {
  ctx: Context<MessengerAuthValue>
  params: MessengerProfileRequest
}): Promise<void> => {
  const { ctx, params } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth

  await facebookGraphClient.post(`${version}/me/messenger_profile`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
    },
    json: params,
  })
}

export const createPersona = async (props: {
  ctx: Context<MessengerAuthValue>
  persona: PersonaRequest
}): Promise<{ personaId?: string }> => {
  const { ctx, persona } = props

  const response: { id: string } = await facebookGraphClient.post(
    `me/personas?access_token=${ctx.auth.tokens.accessToken}`,
    {
      headers: {
        "Content-Type": "application/json",
      },
      json: persona,
    },
  )
  return { personaId: response.id }
}

export const deleteAllPersonas = async (props: {
  ctx: Context<MessengerAuthValue>
}): Promise<void> => {
  const { ctx } = props

  const response: { data: Array<{ id: string }> } =
    await facebookGraphClient.get("me/personas", {
      headers: {
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
    })

  await Promise.all(
    response.data.map((persona) =>
      facebookGraphClient.delete(persona.id, {
        headers: {
          Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
        },
      }),
    ),
  )
}

export const updatePersona = async (props: {
  ctx: Context<MessengerAuthValue>
  persona: PersonaRequest
}): Promise<{ personaId?: string }> => {
  const { ctx, persona } = props

  try {
    await deleteAllPersonas({ ctx })

    if (!persona) {
      return {}
    }
    return await createPersona({ ctx, persona })
  } catch (error) {
    logger.error(error, "Update persona failed")
    return {}
  }
}

export const getPersistentMenu = async (props: {
  ctx: Context<MessengerAuthValue>
}): Promise<{
  persistentMenu?: MessengerProfileRequest["persistent_menu"]
}> => {
  const { ctx } = props

  const { version = DEFAULT_API_VERSION } = ctx.auth

  try {
    const response: {
      persistent_menu?: MessengerProfileRequest["persistent_menu"]
    } = await facebookGraphClient.get(`${version}/me/messenger_profile`, {
      headers: {
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
      searchParams: {
        fields: "persistent_menu",
      },
    })

    return {
      persistentMenu: response.persistent_menu,
    }
  } catch (error) {
    logger.error(error, "Get Persistent Menu failed")
    throw new MessengerAPIException(
      "Get Persistent Menu failed",
      `${version}/me/messenger_profile?fields=persistent_menu`,
    ).setOriginError(error)
  }
}

export const deleteMessengerProfileFields = async (props: {
  ctx: Context<MessengerAuthValue>
  fields: string[]
}): Promise<void> => {
  const { ctx, fields } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth

  await facebookGraphClient.delete(`${version}/me/messenger_profile`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
    },
    json: { fields },
  })
}

export const addBranding = async (props: {
  ctx: Context<MessengerAuthValue>
  title: string
  url: string
}): Promise<void> => {
  const { ctx } = props

  const { persistentMenu } = await getPersistentMenu({ ctx })

  if (!persistentMenu || persistentMenu.length === 0) {
    await updateMessengerProfile({
      ctx,
      params: {
        get_started: {
          payload: "GET_STARTED",
        },
        persistent_menu: [
          {
            locale: "default",
            composer_input_disabled: false,
            call_to_actions: [
              {
                type: "web_url",
                title: props.title,
                url: props.url,
                webview_height_ratio: "full",
              },
            ],
          },
        ],
      },
    })
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
        call_to_actions: [
          ...(menu.call_to_actions || []),
          {
            type: "web_url" as const,
            title: props.title,
            url: props.url,
            webview_height_ratio: "full" as const,
          },
        ],
      }
    }
    return menu
  })

  await updateMessengerProfile({
    ctx,
    params: {
      persistent_menu: updatedMenu,
    },
  })
}
