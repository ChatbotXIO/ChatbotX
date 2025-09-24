import type { ContactEntity, Context } from "@aha.chat/sdk"
import ky from "ky"
import { ZaloException } from "../libs/exception"
import { fetchAndReuploadImage } from "../libs/image"
import { logger } from "../libs/logger"
import type { ZaloAuthValue } from "../schemas/definition"

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
      result.avatar = await fetchAndReuploadImage({
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
