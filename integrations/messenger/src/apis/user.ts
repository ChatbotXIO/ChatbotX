import type { ContactEntity, Context } from "@aha.chat/sdk"
import { createId } from "@paralleldrive/cuid2"
import { API_URL } from "../constants"
import { MessengerAPIException } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type { FacebookUserProfile, MessengerAuthValue } from "../schemas"

export const getUserProfile = async ({
  ctx,
  psid,
}: {
  ctx: Context<MessengerAuthValue>
  psid: string
}): Promise<ContactEntity> => {
  try {
    const response = await facebookGraphClient.get<FacebookUserProfile>(
      `${ctx.auth.metadata.version}/${psid}`,
      {
        headers: {
          Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
        },
      },
    )

    const result: ContactEntity = {
      sourceId: psid,
      firstName: response.first_name,
      lastName: response.last_name,
    }

    if (response.profile_pic) {
      result.avatar = await getUserProfilePicture({
        ctx,
        pictureUrl: response.profile_pic,
      })
    }

    return result
  } catch (error) {
    logger.error("getUserProfile error", error)
    throw new MessengerAPIException(
      "Failed to fetch user profile",
      `${API_URL}/${ctx.auth.metadata.version}/${psid}`,
    )
  }
}

export const getUserProfilePicture = async ({
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
