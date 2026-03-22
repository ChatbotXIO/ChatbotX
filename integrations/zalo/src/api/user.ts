import type { Context, IncomingContact } from "@aha.chat/sdk"
import { ZALO_API_ENDPOINTS } from "../constants"
import { handleZaloError, ZaloException } from "../libs/exception"
import { ZaloHttpClient } from "../libs/http-client"
import { fetchAndReuploadImage } from "../libs/image"
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

export const getUserProfile = ({
  ctx,
  psid,
}: {
  ctx: Context<ZaloAuthValue>
  psid: string
}): Promise<IncomingContact> =>
  handleZaloError("Get user profile", async () => {
    const client = ZaloHttpClient.createAuthenticatedClient(
      ctx.auth.tokens.accessToken,
    )

    const queryData = encodeURIComponent(JSON.stringify({ user_id: psid }))
    const response = await client.get<ZaloUserProfileResponse>(
      `${ZALO_API_ENDPOINTS.OA.GET_USER_PROFILE}?data=${queryData}`,
    )

    if (response.error !== 0) {
      throw new ZaloException(response.message)
    }

    const result: IncomingContact = {
      sourceId: psid,
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
  })
