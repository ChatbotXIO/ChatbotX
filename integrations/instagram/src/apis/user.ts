import type { Context, IncomingContact } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { fetchMediaWithLimits } from "@chatbotx.io/utils/media-download"
import { rescue } from "../exception"
import { instagramBusinessClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type { InstagramAuthValue, InstagramUserProfile } from "../schemas"

const fetchUserProfile = async ({
  ctx,
  psid,
}: {
  ctx: Context<InstagramAuthValue>
  psid: string
}): Promise<InstagramUserProfile> => {
  const queries = new URLSearchParams({
    fields: "id,name,username,profile_pic",
    access_token: ctx.auth.tokens.accessToken,
  })
  return await instagramBusinessClient.get<InstagramUserProfile>(
    `${ctx.auth.metadata.version}/${psid}?${queries.toString()}`,
  )
}

export const getUserProfile = ({
  ctx,
  psid,
}: {
  ctx: Context<InstagramAuthValue>
  psid: string
}): Promise<IncomingContact> => {
  const endpoint = `${ctx.auth.metadata.version}/${psid}`

  return rescue(endpoint, async () => {
    const response = await fetchUserProfile({ ctx, psid })

    const result: IncomingContact = {
      sourceId: psid,
      firstName: response.name,
      // Persisted so `@handle` mentions inside a comment can be resolved back
      // to a known contact — Instagram gives no tagged-user ids, only handles.
      sourceUsername: response.username,
    }

    if (response.profile_pic) {
      try {
        result.avatar = await getUserProfilePicture({
          ctx,
          pictureUrl: response.profile_pic,
        })
      } catch (error) {
        logger.error(error, "getUserProfilePicture error")
      }
    }

    return result
  })
}

export const getContactProfilePicUrl = ({
  ctx,
  psid,
}: {
  ctx: Context<InstagramAuthValue>
  psid: string
}): Promise<string | null> => {
  const endpoint = `${ctx.auth.metadata.version}/${psid}`
  return rescue(endpoint, async () => {
    const response = await fetchUserProfile({ ctx, psid })
    return response.profile_pic ?? null
  })
}

export const getUserProfilePicture = async ({
  ctx,
  pictureUrl,
}: {
  ctx: Context<InstagramAuthValue>
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
  const originPath = `${ctx.storagePrefix}/avatars/${createId()}`
  await ctx.uploader?.putObject(originPath, Buffer.from(media.bytes), {
    ACL: "public-read",
    ContentType: media.mimeType,
  })

  return originPath
}
