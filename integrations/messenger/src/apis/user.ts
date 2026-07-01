import type {
  ContactHandlers,
  Context,
  IncomingContact,
  PersistentMenu,
  UserCustomSettings,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type {
  FacebookUserProfile,
  MessengerAuthValue,
  MessengerProfileRequest,
} from "../schema"

export const setUserPersistentMenu = (props: {
  ctx: Context<MessengerAuthValue>
  psid: string
  persistentMenu: MessengerProfileRequest["persistent_menu"]
}): Promise<void> => {
  const { ctx, psid, persistentMenu } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const endpoint = `${version}/me/custom_user_settings`

  return rescue(endpoint, () =>
    facebookGraphClient.post(endpoint, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
      json: {
        psid,
        persistent_menu: persistentMenu,
      },
    }),
  )
}

/**
 * Retrieve the current user- and page-level custom settings (persistent menu +
 * composer state) for a single PSID via `me/custom_user_settings`. The
 * locale-scoped Graph response is normalized to the default-locale (`[0]`)
 * entry for each level.
 */
export const getCustomUserSettings = (props: {
  ctx: Context<MessengerAuthValue>
  psid: string
}): Promise<UserCustomSettings> => {
  const { ctx, psid } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const endpoint = `${version}/me/custom_user_settings`

  return rescue(endpoint, async () => {
    const res = await facebookGraphClient.get<{
      data?: Array<{
        user_level_persistent_menu?: PersistentMenu[]
        page_level_persistent_menu?: PersistentMenu[]
      }>
    }>(endpoint, {
      headers: {
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
      searchParams: {
        psid,
        fields: "user_level_persistent_menu,page_level_persistent_menu",
      },
    })

    const settings = res.data?.[0]
    return {
      userLevel: settings?.user_level_persistent_menu?.[0],
      pageLevel: settings?.page_level_persistent_menu?.[0],
    }
  })
}

export const deleteUserPersistentMenu = (props: {
  ctx: Context<MessengerAuthValue>
  psid: string
}): Promise<void> => {
  const { ctx, psid } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const endpoint = `${version}/me/custom_user_settings`

  return rescue(endpoint, () =>
    facebookGraphClient.delete(endpoint, {
      headers: {
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
      searchParams: {
        psid,
        params: JSON.stringify(["persistent_menu"]),
      },
    }),
  )
}

export const getUserProfile: ContactHandlers<MessengerAuthValue>["getProfile"] =
  (props) => {
    const {
      data: { sourceId },
      ctx,
    } = props
    const endpoint = `${API_URL}/${ctx.auth.metadata.version}/${sourceId}`

    return rescue(endpoint, async () => {
      const response = await facebookGraphClient.get<FacebookUserProfile>(
        `${ctx.auth.metadata.version}/${sourceId}`,
        {
          headers: {
            Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
          },
        },
      )

      const result: IncomingContact = {
        sourceId,
        firstName: response.first_name,
        lastName: response.last_name,
      }

      if (response.profile_pic) {
        try {
          result.avatar = await getContactProfilePicture({
            ctx,
            pictureUrl: response.profile_pic,
          })
        } catch (error) {
          logger.error(error, "getContactProfilePicture error")
        }
      }

      return result
    })
  }

const getContactProfilePicture = async ({
  ctx,
  pictureUrl,
}: {
  ctx: Context<MessengerAuthValue>
  pictureUrl: string
}): Promise<string | undefined> => {
  const response = await fetch(pictureUrl, {
    headers: {
      Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      "User-Agent": "node",
    },
  })
  if (response.ok && response.body) {
    const originPath = `public/space/${ctx.storagePrefix}/avatars/${createId()}`
    const bytes = await response.arrayBuffer()
    const mimeType = response.headers.get("content-type") ?? "image/png"

    await ctx.uploader?.putObject(originPath, Buffer.from(bytes), {
      ACL: "public-read",
      ContentType: mimeType,
    })

    return originPath
  }
}
