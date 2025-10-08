import type { ContactEntity, Context } from "@aha.chat/sdk"
import { ZaloException } from "../libs/exception"
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

export const getUserProfile = async ({
  ctx,
  uid,
}: {
  ctx: Context<ZaloAuthValue>
  uid: string
}): Promise<ContactEntity> => {
  try {
    const client = ZaloHttpClient.createAuthenticatedClient(
      ctx.auth.tokens.accessToken,
    )

    const queryData = encodeURIComponent(JSON.stringify({ user_id: uid }))
    const response = await client.get<ZaloUserProfileResponse>(
      `v2.0/oa/getprofile?data=${queryData}`,
    )

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
    if (error instanceof ZaloException) {
      throw error
    }

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred"

    throw new ZaloException(`Zalo request user profile failed: ${errorMessage}`)
  }
}
