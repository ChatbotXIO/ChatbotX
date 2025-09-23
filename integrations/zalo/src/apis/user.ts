import type { ContactEntity, Context } from "@aha.chat/sdk"
import ky from "ky"
import { logger } from "../libs/logger"
import type { ZaloAuthValue } from "../schemas/app"
import type { ZaloUserProfile } from "../schemas/user"

export const getUserProfile = async ({
  ctx,
  uid,
}: {
  ctx: Context<ZaloAuthValue>
  uid: string
}): Promise<ContactEntity> => {
  try {
    const response = await ky
      .get<ZaloUserProfile>(
        `GET https://openapi.zalo.me/v2.0/oa/getprofile?data={"user_id":"${uid}"}`,
        {
          headers: {
            access_token: ctx.auth.tokens.accessToken,
          },
        },
      )
      .json()

    const result: ContactEntity = {
      sourceId: uid,
      fullName: response.data?.display_name || "",
      avatar: response.data?.avatar || "",
    }

    return result
  } catch (error) {
    logger.error("getUserProfile error", error)

    throw new Error(`Zalo request user profile failed: ${error}`)
  }
}
