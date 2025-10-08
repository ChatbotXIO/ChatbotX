import type { Oauth2Config } from "@aha.chat/sdk"
import { ZaloException } from "../libs/exception"
import { ZaloHttpClient } from "../libs/http-client"
import { DEFAULT_VERSION } from "../schemas/definition"

export function generateAuthUrl(props: Oauth2Config) {
  const {
    clientId,
    redirectUrl,
    version = DEFAULT_VERSION,
    stateParams,
  } = props
  const baseUrl = `https://oauth.zaloapp.com/${version}/oa/permission`
  const params = new URLSearchParams({
    app_id: clientId,
    redirect_uri: redirectUrl,
    state: btoa(JSON.stringify(stateParams)),
  })

  return `${baseUrl}?${params.toString()}`
}

export type ZaloAccessTokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
}

export const convertCodeToTokens = async (
  setting: Oauth2Config,
  code: string,
): Promise<ZaloAccessTokenResponse> => {
  try {
    const { version = DEFAULT_VERSION } = setting
    const client = ZaloHttpClient.createOAuthClient({ version })

    return await client.post<ZaloAccessTokenResponse>(
      `https://oauth.zaloapp.com/${version}/oa/access_token`,
      {
        prefixUrl: "",
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
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred"

    throw new ZaloException(`Zalo request access token failed: ${errorMessage}`)
  }
}

export const refreshAccessToken = async (
  setting: Oauth2Config,
  refreshToken: string,
): Promise<ZaloAccessTokenResponse> => {
  try {
    const { version = DEFAULT_VERSION } = setting
    const client = ZaloHttpClient.createOAuthClient({ version })

    return await client.post<ZaloAccessTokenResponse>(
      `https://oauth.zaloapp.com/${version}/oa/access_token`,
      {
        prefixUrl: "",
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
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred"

    throw new ZaloException(`Zalo refresh access token failed: ${errorMessage}`)
  }
}

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

export const getZaloOAProfile = async (
  accessToken: string,
): Promise<ZaloOAProfileResponse["data"]> => {
  try {
    const client = ZaloHttpClient.createAuthenticatedClient(accessToken)
    const result = await client.get<ZaloOAProfileResponse>("v2.0/oa/getoa")

    if (result.error !== 0) {
      throw new ZaloException(result.message)
    }

    return result.data
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred"

    throw new ZaloException(`Zalo request OA profile failed: ${errorMessage}`)
  }
}
