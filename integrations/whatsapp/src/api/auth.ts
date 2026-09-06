import type { Oauth2Config } from "@chatbotx.io/sdk"
import ky from "ky"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { logger } from "../lib/logger"

type ExchangeAccessTokenResponse = {
  access_token: string
  token_type: string
}

/** One entry of `debug_token`'s `granular_scopes`: a permission + its target ids. */
export type DebugTokenGranularScope = {
  scope: string
  target_ids?: string[]
}

export type DebugTokenData = {
  app_id: string
  is_valid: boolean
  user_id: string
  granular_scopes?: DebugTokenGranularScope[]
}

type DebugTokenResponse = {
  data: DebugTokenData
}

const WHATSAPP_BUSINESS_MANAGEMENT_SCOPE = "whatsapp_business_management"

export const exchangeAccessToken = (
  settings: Pick<Oauth2Config, "clientId" | "clientSecret" | "version">,
  code: string,
  /**
   * Must be passed (and exactly match) when the `code` came from a standard OAuth
   * dialog opened with an explicit `redirect_uri`. Omit for embedded-signup codes
   * returned by the JS SDK, which are exchanged without a redirect_uri.
   */
  redirectUri?: string,
): Promise<ExchangeAccessTokenResponse> => {
  const { version = DEFAULT_API_VERSION } = settings

  return rescue(() =>
    ky
      .get<ExchangeAccessTokenResponse>(
        `${API_URL}/${version}/oauth/access_token`,
        {
          searchParams: {
            client_id: settings.clientId,
            client_secret: settings.clientSecret,
            code,
            ...(redirectUri ? { redirect_uri: redirectUri } : {}),
          },
        },
      )
      .json(),
  )
}

export const exchangeLongLivedToken = (
  settings: { clientId: string; clientSecret: string },
  accessToken: string,
): Promise<string> =>
  rescue(async () => {
    const result = await ky
      .get<ExchangeAccessTokenResponse>(
        `${API_URL}/${DEFAULT_API_VERSION}/oauth/access_token`,
        {
          searchParams: {
            grant_type: "fb_exchange_token",
            client_id: settings.clientId,
            client_secret: settings.clientSecret,
            fb_exchange_token: accessToken,
          },
        },
      )
      .json()
    return result.access_token
  })

async function requestDebugToken(
  accessToken: string,
  debugAccessToken: string,
): Promise<DebugTokenData | null> {
  const result = await ky
    .get<DebugTokenResponse>(`${API_URL}/debug_token`, {
      searchParams: {
        input_token: accessToken,
        access_token: debugAccessToken,
      },
    })
    .json()

  if (!result.data.is_valid) {
    return null
  }

  return result.data
}

export async function debugToken(
  accessToken: string,
  debugAccessToken = accessToken,
): Promise<DebugTokenData | null> {
  try {
    return await requestDebugToken(accessToken, debugAccessToken)
  } catch (e) {
    logger.error(e, "Failed to debug token")
    return null
  }
}

export function debugTokenOrThrow(
  accessToken: string,
  debugAccessToken = accessToken,
): Promise<DebugTokenData | null> {
  return requestDebugToken(accessToken, debugAccessToken)
}

/**
 * Resolve every WhatsApp Business Account id the access token was granted via
 * the `whatsapp_business_management` scope. A system-user token from embedded
 * signup carries every WABA the business has already shared with the app — not
 * only the one picked in the dialog — and Meta does not keep the order stable
 * between tokens. Callers that already know which WABA they expect must check
 * membership in this list instead of trusting the first entry.
 */
export async function getSharedWabaIds(
  accessToken: string,
  appAccessToken: string,
): Promise<string[]> {
  const data = await debugToken(accessToken, appAccessToken)
  const scope = data?.granular_scopes?.find(
    (s) => s.scope === WHATSAPP_BUSINESS_MANAGEMENT_SCOPE,
  )
  return scope?.target_ids ?? []
}
