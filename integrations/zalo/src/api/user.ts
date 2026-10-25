import {
  type Context,
  type IncomingContact,
  normalizeGender,
} from "@chatbotx.io/sdk"
import { consumeGoogleClickRef } from "@chatbotx.io/utils/google-click"
import { ZALO_API_ENDPOINTS } from "../constants"
import { handleZaloError } from "../lib/exception"
import { ZaloHttpClient } from "../lib/http-client"
import { fetchAndReuploadImage } from "../lib/image"
import type { ZaloAuthValue, ZaloUserDetail } from "../schema/definition"

export type ZaloUserProfileResponse = {
  error: number
  message: string
  data: ZaloUserDetail
}

/**
 * The one reader of `GET /v3.0/oa/user/detail`, shared by the profile and the
 * `getUserDetail` action. A non-zero `error` is thrown by the HTTP client.
 * `requestTimeoutMs` bounds the whole request including the body and disables
 * retries, for best-effort lookups.
 */
export const fetchZaloUserDetail = async ({
  accessToken,
  userId,
  requestTimeoutMs,
}: {
  accessToken: string
  userId: string
  requestTimeoutMs?: number
}): Promise<ZaloUserDetail> => {
  const client = ZaloHttpClient.createAuthenticatedClient(
    accessToken,
    requestTimeoutMs === undefined ? undefined : { retries: 0 },
  )
  const queryData = encodeURIComponent(JSON.stringify({ user_id: userId }))
  const response = await client.get<ZaloUserProfileResponse>(
    `${ZALO_API_ENDPOINTS.OA.GET_USER_PROFILE}?data=${queryData}`,
    requestTimeoutMs === undefined
      ? {}
      : { signal: AbortSignal.timeout(requestTimeoutMs) },
  )
  return response.data
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

/**
 * Zalo never puts the Google click in a webhook: it is the user's last
 * `dynamic_param`, readable only here. Anything that is not a Google click is
 * ignored (and never stored).
 */
const readGoogleReferral = (
  dynamicParam: string | undefined,
): Pick<IncomingContact, "referral"> => {
  const { googleReferral } = consumeGoogleClickRef(dynamicParam, new Date())
  return googleReferral ? { referral: googleReferral } : {}
}

export const getUserProfile = ({
  ctx,
  psid,
  includeAvatar = true,
  requestTimeoutMs,
}: {
  ctx: Context<ZaloAuthValue>
  psid: string
  includeAvatar?: boolean
  requestTimeoutMs?: number
}): Promise<IncomingContact> =>
  handleZaloError("Get user profile", async () => {
    const detail = await fetchZaloUserDetail({
      accessToken: ctx.auth.tokens.accessToken,
      userId: psid,
      requestTimeoutMs,
    })

    const result: IncomingContact = {
      sourceId: psid,
      firstName: detail?.display_name || "",
      phoneNumber: detail?.shared_info?.phone || "",
      gender: normalizeZaloGender(detail?.user_gender),
      ...readGoogleReferral(detail?.dynamic_param),
    }

    if (includeAvatar && detail?.avatar) {
      result.avatar = await fetchAndReuploadImage({
        ctx,
        avatarUrl: detail.avatar,
      })
    }

    return result
  })
