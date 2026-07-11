import { DEFAULT_API_VERSION, FACEBOOK_ADS_SCOPES } from "../constants"
import { rescue } from "../exception"
import { facebookAdsGraphClient } from "../lib/http-client"

const FACEBOOK_OAUTH_BASE = "https://www.facebook.com"

export function generateAdsAuthUrl({
  clientId,
  version = DEFAULT_API_VERSION,
  redirectUrl,
  stateParams,
}: {
  clientId: string
  version?: string
  redirectUrl: string
  stateParams?: Record<string, unknown>
}): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUrl,
    scope: FACEBOOK_ADS_SCOPES.join(","),
    response_type: "code",
    state: Buffer.from(JSON.stringify(stateParams ?? {})).toString("base64"),
  })
  return `${FACEBOOK_OAUTH_BASE}/${version}/dialog/oauth?${params.toString()}`
}

export function exchangeCodeForToken(
  settings: { clientId: string; clientSecret: string; version?: string },
  code: string,
  redirectUrl: string,
): Promise<string> {
  const { version = DEFAULT_API_VERSION } = settings
  const endpoint = `${version}/oauth/access_token`

  return rescue(endpoint, async () => {
    const res: { access_token: string } = await facebookAdsGraphClient.get(
      endpoint,
      {
        searchParams: {
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          redirect_uri: redirectUrl,
          code,
        },
      },
    )
    return res.access_token
  })
}

/**
 * Exchange a short-lived user token for a long-lived (~60 day) one.
 * `expiresIn` is Facebook's `expires_in` in seconds; it can be absent when
 * Facebook returns a token without a fixed expiry.
 */
export function exchangeLongLivedToken(
  settings: { clientId: string; clientSecret: string; version?: string },
  shortLivedToken: string,
): Promise<{ accessToken: string; expiresIn?: number }> {
  const { version = DEFAULT_API_VERSION } = settings
  const endpoint = `${version}/oauth/access_token`

  return rescue(endpoint, async () => {
    const res: { access_token: string; expires_in?: number } =
      await facebookAdsGraphClient.get(endpoint, {
        searchParams: {
          grant_type: "fb_exchange_token",
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          fb_exchange_token: shortLivedToken,
        },
      })
    return { accessToken: res.access_token, expiresIn: res.expires_in }
  })
}

/** Best-effort revoke of the app permissions granted by this token. */
export function revokeToken(
  accessToken: string,
  version: string = DEFAULT_API_VERSION,
): Promise<void> {
  const endpoint = `${version}/me/permissions`

  return rescue(endpoint, async () => {
    await facebookAdsGraphClient.delete(endpoint, {
      searchParams: { access_token: accessToken },
    })
  })
}
