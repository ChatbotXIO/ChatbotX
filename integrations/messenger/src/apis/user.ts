import type {
  ContactHandlers,
  Context,
  IncomingContact,
  PersistentMenu,
  UserCustomSettings,
} from "@chatbotx.io/sdk"
import { normalizeGender, normalizeUtcOffset } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { fetchMediaWithLimits } from "@chatbotx.io/utils/media-download"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { parseOriginError, rescue } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type {
  FacebookPublicUserProfile,
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

const fetchUserProfile = async (props: {
  ctx: Context<MessengerAuthValue>
  sourceId: string
}): Promise<FacebookUserProfile> =>
  await facebookGraphClient.get<FacebookUserProfile>(
    `${props.ctx.auth.metadata.version}/${props.sourceId}`,
    {
      headers: {
        Authorization: `Bearer ${props.ctx.auth.tokens.accessToken}`,
      },
      searchParams: {
        fields: "first_name,last_name,profile_pic,locale,timezone,gender",
      },
    },
  )

const PUBLIC_PICTURE_FIELD = "picture.height(480).width(480){url,is_silhouette}"
const PUBLIC_USER_PROFILE_FIELDS = `first_name,last_name,name,${PUBLIC_PICTURE_FIELD}`
const PUBLIC_PAGE_PROFILE_FIELDS = `name,${PUBLIC_PICTURE_FIELD}`

const fetchPublicProfileFields = async (props: {
  ctx: Context<MessengerAuthValue>
  sourceId: string
  fields: string
}): Promise<FacebookPublicUserProfile> =>
  await facebookGraphClient.get<FacebookPublicUserProfile>(
    `${props.ctx.auth.metadata.version}/${props.sourceId}`,
    {
      headers: {
        Authorization: `Bearer ${props.ctx.auth.tokens.accessToken}`,
      },
      searchParams: { fields: props.fields },
    },
  )

// Graph rejects the person-only fields (`first_name`, `last_name`) when the id
// belongs to a Page, e.g. another Page commenting on a post.
const isPageNodeFieldError = (error: unknown): boolean => {
  const { code, message } = parseOriginError(error)
  return (
    Number(code) === 100 && (message?.includes("node type (Page)") ?? false)
  )
}

/**
 * The public profile a page token can read for anyone who interacted with the
 * page — including a commenter who never messaged it, for whom the Messenger
 * User Profile fields (`profile_pic`, `locale`, …) are unavailable.
 */
const fetchPublicUserProfile = async (props: {
  ctx: Context<MessengerAuthValue>
  sourceId: string
}): Promise<FacebookPublicUserProfile> => {
  try {
    return await fetchPublicProfileFields({
      ...props,
      fields: PUBLIC_USER_PROFILE_FIELDS,
    })
  } catch (error) {
    if (!isPageNodeFieldError(error)) {
      throw error
    }
    return await fetchPublicProfileFields({
      ...props,
      fields: PUBLIC_PAGE_PROFILE_FIELDS,
    })
  }
}

// Facebook's default silhouette is not a real avatar.
const getPublicPictureUrl = (
  profile: FacebookPublicUserProfile,
): string | undefined =>
  profile.picture?.data?.is_silhouette ? undefined : profile.picture?.data?.url

/**
 * Messenger User Profile first; when it fails or has no `profile_pic` (the
 * user never messaged the page), the public profile fills in the name and
 * picture. Throws the Messenger error only when both lookups fail.
 */
const fetchProfileWithPublicFallback = async (props: {
  ctx: Context<MessengerAuthValue>
  sourceId: string
}): Promise<{ profile: FacebookUserProfile; pictureUrl?: string }> => {
  let messengerProfile: FacebookUserProfile | undefined
  let messengerError: unknown
  try {
    messengerProfile = await fetchUserProfile(props)
  } catch (error) {
    messengerError = error
  }

  if (messengerProfile?.profile_pic) {
    return {
      profile: messengerProfile,
      pictureUrl: messengerProfile.profile_pic,
    }
  }

  let publicProfile: FacebookPublicUserProfile
  try {
    publicProfile = await fetchPublicUserProfile(props)
  } catch (error) {
    logger.warn(
      { err: error, sourceId: props.sourceId },
      "fetchPublicUserProfile error",
    )
    if (!messengerProfile) {
      throw messengerError
    }
    return { profile: messengerProfile }
  }

  return {
    profile: {
      ...messengerProfile,
      id: props.sourceId,
      first_name:
        messengerProfile?.first_name ??
        publicProfile.first_name ??
        publicProfile.name,
      last_name: messengerProfile?.last_name ?? publicProfile.last_name,
    },
    pictureUrl: getPublicPictureUrl(publicProfile),
  }
}

export const getUserProfile: ContactHandlers<MessengerAuthValue>["getProfile"] =
  ({ data: { sourceId }, ctx }) => {
    const endpoint = `${API_URL}/${ctx.auth.metadata.version}/${sourceId}`

    return rescue(endpoint, async () => {
      const { profile, pictureUrl } = await fetchProfileWithPublicFallback({
        ctx,
        sourceId,
      })

      const result: IncomingContact = {
        sourceId,
        firstName: profile.first_name,
        lastName: profile.last_name,
        locale: profile.locale,
        timezone: normalizeUtcOffset(profile.timezone),
        gender: normalizeGender(profile.gender),
      }

      if (pictureUrl) {
        try {
          result.avatar = await getContactProfilePicture({
            ctx,
            pictureUrl,
          })
        } catch (error) {
          logger.error(error, "getContactProfilePicture error")
        }
      }

      return result
    })
  }

export const getContactProfilePicUrl: ContactHandlers<MessengerAuthValue>["getContactProfilePicUrl"] =
  ({ data: { sourceId }, ctx }) => {
    const endpoint = `${API_URL}/${ctx.auth.metadata.version}/${sourceId}`
    return rescue(endpoint, async () => {
      const { pictureUrl } = await fetchProfileWithPublicFallback({
        ctx,
        sourceId,
      })
      return pictureUrl ?? null
    })
  }

const getContactProfilePicture = async ({
  ctx,
  pictureUrl,
}: {
  ctx: Context<MessengerAuthValue>
  pictureUrl: string
}): Promise<string | undefined> => {
  const media = await fetchMediaWithLimits(pictureUrl, {
    headers: {
      Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      "User-Agent": "node",
    },
  })
  if (!media) {
    return
  }
  const originPath = `public/space/${ctx.storagePrefix}/avatars/${createId()}`
  await ctx.uploader?.putObject(originPath, Buffer.from(media.bytes), {
    ACL: "public-read",
    ContentType: media.mimeType,
  })

  return originPath
}
