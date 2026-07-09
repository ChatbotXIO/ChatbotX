import {
  type Context,
  type IncomingContact,
  normalizeGender,
} from "@chatbotx.io/sdk"
import { ZALO_API_ENDPOINTS } from "../constants"
import { handleZaloError, ZaloException } from "../lib/exception"
import { ZaloHttpClient } from "../lib/http-client"
import { fetchAndReuploadImage } from "../lib/image"
import type { ZaloAuthValue } from "../schema/definition"

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
    user_gender?: number | string
  }
}

const normalizeZaloGender = (
  gender: number | string | undefined,
): string | undefined => {
  if (gender === 1 || gender === "1") {
    return normalizeGender("male")
  }
  if (gender === 2 || gender === "2") {
    return normalizeGender("female")
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
      throw new ZaloException(
        response.message,
        undefined,
        response.error,
        undefined,
        undefined,
        { response: { error: response } },
      )
    }

    const result: IncomingContact = {
      sourceId: psid,
      firstName: response.data?.display_name || "",
      phoneNumber: response.data?.shared_info?.phone || "",
      gender: normalizeZaloGender(response.data?.user_gender),
    }

    if (response.data?.avatar) {
      result.avatar = await fetchAndReuploadImage({
        ctx,
        avatarUrl: response.data.avatar,
      })
    }

    return result
  })
