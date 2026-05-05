import type { Oauth2Config } from "@chatbotx.io/sdk"
import ky from "ky"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { WhatsappException } from "../exception"

type ExchangeAccessTokenResponse = {
  access_token: string
  token_type: string
}

export type DebugTokenData = {
  app_id: string
  is_valid: boolean
  user_id: string
}

type DebugTokenResponse = {
  data: DebugTokenData
}

export const exchangeAccessToken = async (
  settings: Pick<Oauth2Config, "clientId" | "clientSecret" | "version">,
  code: string,
): Promise<ExchangeAccessTokenResponse> => {
  const { version = DEFAULT_API_VERSION } = settings

  try {
    const result = await ky
      .get<ExchangeAccessTokenResponse>(
        `${API_URL}/${version}/oauth/access_token`,
        {
          searchParams: {
            client_id: settings.clientId,
            client_secret: settings.clientSecret,
            code,
          },
        },
      )
      .json()

    return result
  } catch (e) {
    console.error("Failed to exchange access token", e)
    throw new WhatsappException(
      "Failed to exchange access token",
    ).setOriginError(e)
  }
}

export async function debugToken(
  accessToken: string,
): Promise<DebugTokenData | null> {
  try {
    const result = await ky
      .get<DebugTokenResponse>(`${API_URL}/debug_token`, {
        searchParams: {
          input_token: accessToken,
          access_token: accessToken,
        },
      })
      .json()

    if (!result.data.is_valid) {
      return null
    }

    return result.data
  } catch (e) {
    console.error("Failed to debug token", e)
    return null
  }
}
