import type { ContactEntity, Context } from "@aha.chat/sdk"
import { createId } from "@paralleldrive/cuid2"
import ky from "ky"
import { ZaloException } from "../libs/exception"
import { logger } from "../libs/logger"
import type { ZaloAuthValue } from "../schemas/app"

export type ZaloUserProfileResponse = {
  error: number
  message: string
  data: {
    user_id: string
    display_name: string
    avatar: string
    shared_info?: {
      phone?: string
    }
  }
}

export const getUserProfile = async ({
  ctx,
  uid,
}: {
  ctx: Context<ZaloAuthValue>
  uid: string
}): Promise<ContactEntity> => {
  try {
    const response = await ky
      .get<ZaloUserProfileResponse>(
        `GET https://openapi.zalo.me/v2.0/oa/getprofile?data={"user_id":"${uid}"}`,
        {
          headers: {
            access_token: ctx.auth.tokens.accessToken,
          },
        },
      )
      .json()

    if (response.error !== 0) {
      throw new ZaloException(response.message)
    }

    const result: ContactEntity = {
      sourceId: uid,
      firstName: response.data?.display_name || "",
      phoneNumber: response.data?.shared_info?.phone || "",
    }

    if (response.data?.avatar) {
      result.avatar = await getUserAvatar({
        ctx,
        avatarUrl: response.data.avatar,
      })
    }

    return result
  } catch (error) {
    logger.error("getUserProfile error", error)

    throw new Error(`Zalo request user profile failed: ${error}`)
  }
}

export const getUserAvatar = async ({
  ctx,
  avatarUrl,
}: {
  ctx: Context<ZaloAuthValue>
  avatarUrl: string
}): Promise<string | undefined> => {
  const response = await fetch(avatarUrl, {
    headers: {
      Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      "User-Agent": "node",
    },
  })
  if (response.ok && response.body) {
    const originPath = `public/chatbots/avatars/${createId()}`
    const bytes = await response.arrayBuffer()
    const mimeType = response.headers.get("content-type") ?? "image/png"

    await ctx.uploader?.putObject(originPath, Buffer.from(bytes), {
      ACL: "public-read",
      ContentType: mimeType,
    })

    return originPath
  }
}
