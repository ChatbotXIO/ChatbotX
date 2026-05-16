import type { Context } from "@chatbotx.io/sdk"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
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
    const res: { access_token: string } = await facebookGraphClient.get(
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

export const subscribePageToAppWebhook = (props: {
  pageId: string
  accessToken: string
  version?: string
}): Promise<void> => {
  const { version = DEFAULT_API_VERSION } = props
  const endpoint = `${version}/me/subscribed_apps`

  return rescue(endpoint, () =>
    facebookGraphClient.post(endpoint, {
      headers: {
        Authorization: `Bearer ${props.accessToken}`,
      },
      json: {
        subscribed_fields: PAGE_SUBSCRIBE_SCOPES.join(","),
      },
    }),
  )
}

export const unsubscribePageFromAppWebhook = (
  auth: MessengerAuthValue,
): Promise<void> => {
  const { version = DEFAULT_API_VERSION } = auth.metadata
  const endpoint = `${version}/me/subscribed_apps`

  return rescue(endpoint, () =>
    facebookGraphClient.delete(endpoint, {
      headers: {
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
    }),
  )
}

export const updateMessengerProfile = (props: {
  ctx: Context<MessengerAuthValue>
  params: MessengerProfileRequest
}): Promise<void> => {
  const { ctx, params } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const endpoint = `${version}/me/messenger_profile`

  return rescue(endpoint, () =>
    facebookGraphClient.post(endpoint, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
      json: params,
    }),
  )
}

export const createPersona = (props: {
  ctx: Context<MessengerAuthValue>
  persona: PersonaRequest
}): Promise<{ personaId?: string }> => {
  const { ctx, persona } = props
  const endpoint = "me/personas"

  return rescue(endpoint, async () => {
    const response: { id: string } = await facebookGraphClient.post(
      `${endpoint}?access_token=${ctx.auth.tokens.accessToken}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        json: persona,
      },
    )
    return { personaId: response.id }
  })
}

export const deleteAllPersonas = (props: {
  ctx: Context<MessengerAuthValue>
}): Promise<void> => {
  const { ctx } = props

  return rescue("me/personas", async () => {
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
  })
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

export const getPersistentMenu = (props: {
  ctx: Context<MessengerAuthValue>
}): Promise<{
  persistentMenu?: MessengerProfileRequest["persistent_menu"]
}> => {
  const { ctx } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const endpoint = `${version}/me/messenger_profile`

  return rescue(endpoint, async () => {
    const response: {
      persistent_menu?: MessengerProfileRequest["persistent_menu"]
    } = await facebookGraphClient.get(endpoint, {
      headers: {
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
      searchParams: {
        fields: "persistent_menu",
      },
    })

    return { persistentMenu: response.persistent_menu }
  })
}

export const deleteMessengerProfileFields = (props: {
  ctx: Context<MessengerAuthValue>
  fields: string[]
}): Promise<void> => {
  const { ctx, fields } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const endpoint = `${version}/me/messenger_profile`

  return rescue(endpoint, () =>
    facebookGraphClient.delete(endpoint, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
      json: { fields },
    }),
  )
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
