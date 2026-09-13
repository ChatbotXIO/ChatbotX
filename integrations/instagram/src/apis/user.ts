import type { Context, IncomingContact } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { rescue } from "../exception"
import { instagramBusinessClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type { InstagramAuthValue, InstagramUserProfile } from "../schemas"

export const getUserProfile = ({
  ctx,
  psid,
}: {
  ctx: Context<InstagramAuthValue>
  psid: string
}): Promise<IncomingContact> => {
  const endpoint = `${ctx.auth.metadata.version}/${psid}`

  return rescue(endpoint, async () => {
    const queries = new URLSearchParams({
      fields: "id,name,username,profile_pic",
      access_token: ctx.auth.tokens.accessToken,
    })
    const response = await instagramBusinessClient.get<InstagramUserProfile>(
      `${ctx.auth.metadata.version}/${psid}?${queries.toString()}`,
    )

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

export const getUserProfilePicture = async ({
  ctx,
  pictureUrl,
}: {
  ctx: Context<InstagramAuthValue>
  pictureUrl: string
}): Promise<string | undefined> => {
  const response = await fetch(pictureUrl, {
    headers: {
      Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      "User-Agent": "node",
    },
  })
  if (response.ok && response.body) {
    const originPath = `${ctx.storagePrefix}/avatars/${createId()}`
    const bytes = await response.arrayBuffer()
    const mimeType = response.headers.get("content-type") ?? "image/png"

    await ctx.uploader?.putObject(originPath, Buffer.from(bytes), {
      ACL: "public-read",
      ContentType: mimeType,
    })

    return originPath
  }
}
