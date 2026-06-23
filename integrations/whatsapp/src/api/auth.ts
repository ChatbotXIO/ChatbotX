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

export async function debugToken(
  accessToken: string,
  debugAccessToken = accessToken,
): Promise<DebugTokenData | null> {
  try {
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
  } catch (e) {
    logger.error(e, "Failed to debug token")
    return null
  }
}

/**
 * Resolve the WhatsApp Business Account id granted to the access token. Embedded
 * signup grants exactly one WABA via the `whatsapp_business_management` scope, so
 * its `target_ids[0]` is the connected WABA. Used to reconstruct the connect
 * inputs server-side when the OAuth dialog returns only a `code` (the SDK-only
 * `WA_EMBEDDED_SIGNUP` postMessage that normally carries the ids never fires).
 */
export async function getSharedWabaId(
  accessToken: string,
  appAccessToken: string,
): Promise<string | null> {
  const data = await debugToken(accessToken, appAccessToken)
  const scope = data?.granular_scopes?.find(
    (s) => s.scope === WHATSAPP_BUSINESS_MANAGEMENT_SCOPE,
  )
  return scope?.target_ids?.[0] ?? null
}
