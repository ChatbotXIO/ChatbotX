import type { Oauth2Config } from "@aha.chat/sdk"
import ky from "ky"
import { ZaloException } from "../libs/exception"
import { logger } from "../libs/logger"
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
  expires_in: string
}

export async function convertCodeToTokens(
  setting: Oauth2Config,
  code: string,
): Promise<ZaloAccessTokenResponse> {
  try {
    const { version = DEFAULT_VERSION } = setting

    return await ky
      .post(`https://oauth.zaloapp.com/${version}/oa/access_token`, {
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
      })
      .json<ZaloAccessTokenResponse>()
  } catch (error) {
    logger.error("convertCodeToTokens error", error)

    throw new ZaloException(`Zalo request access token failed: ${error}`)
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

export async function getZaloOAProfile(
  accessToken: string,
): Promise<ZaloOAProfileResponse["data"]> {
  try {
    const result = await ky
      .get("https://openapi.zalo.me/v2.0/oa/getoa", {
        headers: {
          access_token: accessToken,
        },
      })
      .json<ZaloOAProfileResponse>()

    if (result.error !== 0) {
      throw new ZaloException(result.message)
    }

    return result.data
  } catch (error) {
    logger.error("getZaloOAProfile error", error)

    throw new ZaloException(`Zalo request OA profile failed: ${error}`)
  }
}
