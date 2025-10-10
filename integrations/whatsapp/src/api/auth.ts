import type { Oauth2Config } from "@aha.chat/sdk"
import ky from "ky"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { WhatsappException } from "../exception"
import { logger } from "../lib/logger"

type ExchangeAccessTokenResponse = {
  access_token: string
  token_type: string
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
    logger.error("Failed to exchange access token", { error: e })
    throw new WhatsappException("Failed to exchange access token")
  }
}
