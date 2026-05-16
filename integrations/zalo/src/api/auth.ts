import type { Oauth2Config } from "@chatbotx.io/sdk"
import { ZALO_API_ENDPOINTS, ZALO_OAUTH_BASE_URL } from "../constants"
import { handleZaloError, ZaloException } from "../lib/exception"
import { ZaloHttpClient } from "../lib/http-client"

export function generateAuthUrl(props: Oauth2Config) {
  const { clientId, redirectUrl, stateParams } = props
  const params = new URLSearchParams({
    app_id: clientId,
    redirect_uri: redirectUrl,
    state: btoa(JSON.stringify(stateParams)),
  })

  return `${ZALO_OAUTH_BASE_URL}${ZALO_API_ENDPOINTS.AUTH.PERMISSION}?${params.toString()}`
}

export type ZaloAccessTokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
}

export const convertCodeToTokens = (
  setting: Oauth2Config,
  code: string,
): Promise<ZaloAccessTokenResponse> =>
  handleZaloError("Convert code to tokens", async () => {
    const client = ZaloHttpClient.createOAuthClient()

    return await client.post<ZaloAccessTokenResponse>(
      ZALO_API_ENDPOINTS.AUTH.ACCESS_TOKEN,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          secret_key: setting.clientSecret,
        },
        body: new URLSearchParams({
          code,
          app_id: setting.clientId,
          redirect_uri: setting.redirectUrl,
          grant_type: "authorization_code",
        }),
      },
    )
  })

export const refreshAccessToken = (
  setting: Oauth2Config,
  refreshToken: string,
): Promise<ZaloAccessTokenResponse> =>
  handleZaloError("Refresh access token", async () => {
    const client = ZaloHttpClient.createOAuthClient()

    return await client.post<ZaloAccessTokenResponse>(
      ZALO_API_ENDPOINTS.AUTH.ACCESS_TOKEN,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          secret_key: setting.clientSecret,
        },
        body: new URLSearchParams({
          app_id: setting.clientId,
          app_secret: setting.clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      },
    )
  })

export type ZaloOAProfileResponse = {
  data: {
    oa_id: string
    name: string
    description: string
    avatar: string
  }
  error: number
  message: string
}

export const getZaloOAProfile = (
  accessToken: string,
): Promise<ZaloOAProfileResponse["data"]> =>
  handleZaloError("Get OA profile", async () => {
    const client = ZaloHttpClient.createAuthenticatedClient(accessToken)
    const result = await client.get<ZaloOAProfileResponse>(
      ZALO_API_ENDPOINTS.OA.GET_PROFILE,
    )

    if (result.error !== 0) {
      throw new ZaloException(
        result.message,
        undefined,
        result.error,
        undefined,
        undefined,
        { response: { error: result } },
      )
    }

    return result.data
  })
