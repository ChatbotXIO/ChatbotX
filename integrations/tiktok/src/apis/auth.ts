import ky from "ky"
import { BUSINESS_API_URL } from "../constants"
import { rescue, TiktokAPIException } from "../exception"
import {
  TIKTOK_COMMENT_AUTOMATION_SCOPES,
  TIKTOK_CORE_SCOPES,
  TIKTOK_OPTIONAL_PROFILE_SCOPES,
} from "../lib/scopes"
import type { BusinessApiResponse } from "../schema"

const TIKTOK_AUTH_BASE_URL = "https://www.tiktok.com/v2/auth/authorize/"
// Business API OAuth — required for Business Messaging API tokens
// https://business-api.tiktok.com/portal/docs?id=1832184159540418
const TIKTOK_TOKEN_URL = `${BUSINESS_API_URL}tt_user/oauth2/token/`
const TIKTOK_REFRESH_URL = `${BUSINESS_API_URL}tt_user/oauth2/refresh_token/`

// The authorize request asks for every scope the app is approved for; the
// three lists differ only in what a MISSING grant costs. Core is refused at
// the callback, comment-automation scopes raise the re-authorize warning, and
// the optional profile scopes cost nothing — see `../lib/scopes`, which owns
// all three plus the ones still awaiting approval.
//
// Never add a scope here before the app carries it: TikTok refuses the WHOLE
// authorize request over one unapproved scope, which takes the channel down
// for DM-only workspaces too.
//
// Adding a scope does not upgrade an existing connection: every
// already-connected account has to re-authorize before the new capability can
// run for it.
const TIKTOK_SCOPES = [
  ...TIKTOK_CORE_SCOPES,
  ...TIKTOK_OPTIONAL_PROFILE_SCOPES,
  ...TIKTOK_COMMENT_AUTOMATION_SCOPES,
].join(",")

export function generateAuthUrl({
  clientId,
  redirectUrl,
  stateParams,
}: {
  clientId: string
  redirectUrl: string
  stateParams?: Record<string, unknown>
}): string {
  const params = new URLSearchParams({
    client_key: clientId,
    response_type: "code",
    scope: TIKTOK_SCOPES,
    redirect_uri: redirectUrl,
    disable_auto_auth: "1",
    state: Buffer.from(JSON.stringify(stateParams ?? {})).toString("base64url"),
  })
  return `${TIKTOK_AUTH_BASE_URL}?${params.toString()}`
}

// Business API wraps token response in data: {}
type BusinessTokenData = {
  access_token: string
  expires_in: number
  open_id: string
  refresh_token_expires_in: number
  refresh_token: string
  scope: string
}

export type TiktokTokenResponse = {
  access_token: string
  expires_in: number
  open_id: string
  refresh_expires_in: number
  refresh_token: string
  scope: string
}

export const exchangeCodeForToken = (
  {
    clientId,
    clientSecret,
    redirectUrl,
  }: { clientId: string; clientSecret: string; redirectUrl: string },
  code: string,
): Promise<TiktokTokenResponse> =>
  rescue("tt_user/oauth2/token", async () => {
    const response = await ky
      .post(TIKTOK_TOKEN_URL, {
        json: {
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          auth_code: code,
          redirect_uri: redirectUrl,
        },
        headers: { "Content-Type": "application/json" },
      })
      .json<BusinessApiResponse<BusinessTokenData>>()

    if (response.code !== 0) {
      throw new TiktokAPIException(response.message ?? "Token exchange failed")
    }

    return {
      access_token: response.data.access_token,
      expires_in: response.data.expires_in,
      open_id: response.data.open_id,
      refresh_expires_in: response.data.refresh_token_expires_in,
      refresh_token: response.data.refresh_token,
      scope: response.data.scope,
    }
  })

export const refreshAccessToken = (
  { clientId, clientSecret }: { clientId: string; clientSecret: string },
  refreshToken: string,
): Promise<TiktokTokenResponse> =>
  rescue("tt_user/oauth2/refresh_token", async () => {
    const response = await ky
      .post(TIKTOK_REFRESH_URL, {
        json: {
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        },
        headers: { "Content-Type": "application/json" },
      })
      .json<BusinessApiResponse<BusinessTokenData>>()

    if (response.code !== 0) {
      throw new TiktokAPIException(response.message ?? "Token refresh failed")
    }

    return {
      access_token: response.data.access_token,
      expires_in: response.data.expires_in,
      open_id: response.data.open_id,
      refresh_expires_in: response.data.refresh_token_expires_in,
      refresh_token: response.data.refresh_token,
      scope: response.data.scope,
    }
  })
