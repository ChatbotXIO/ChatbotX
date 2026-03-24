import type { Context, IncomingContact } from "@aha.chat/sdk"
import { createId } from "@paralleldrive/cuid2"
import { API_URL } from "../constants"
import { InstagramAPIException } from "../exception"
import { instagramGraphClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type { InstagramAuthValue, InstagramUserProfile } from "../schemas"

export const getUserProfile = async ({
  ctx,
  igsid,
}: {
  ctx: Context<InstagramAuthValue>
  igsid: string
}): Promise<IncomingContact> => {
  try {
    const response = await instagramGraphClient.get<InstagramUserProfile>(
      `${ctx.auth.metadata.version}/${igsid}`,
      {
        headers: {
          Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
        },
      },
    )

    const result: IncomingContact = {
      sourceId: igsid,
      firstName: response.name,
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
  } catch (error) {
    logger.error(error, "getUserProfile error")
    throw new InstagramAPIException(
      "Failed to fetch user profile",
      `${API_URL}/${ctx.auth.metadata.version}/${igsid}`,
    )
  }
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
    const originPath = `public/chatbots/${ctx.chatbot?.id}/avatars/${createId()}`
    const bytes = await response.arrayBuffer()
    const mimeType = response.headers.get("content-type") ?? "image/png"

    await ctx.uploader?.putObject(originPath, Buffer.from(bytes), {
      ACL: "public-read",
      ContentType: mimeType,
    })

    return originPath
  }
}
