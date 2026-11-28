import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import {
  type ConnectedSocialAccount,
  SOCIAL_PROVIDER_CAPABILITIES,
} from "@chatbotx.io/utils/social-account"
import { TIKTOK_OPEN_API } from "./publisher-api"

/**
 * The publishing connect of a TikTok account (Login Kit), separate from the
 * inbox integration: its own app, its own tokens, only the scopes of
 * `SOCIAL_PROVIDER_CAPABILITIES.tiktok`.
 *
 * Verified against the official docs (TikTok for Developers):
 * - Authorize `https://www.tiktok.com/v2/auth/authorize/` (client_key, scope as
 *   a comma separated list, redirect_uri, state, response_type=code).
 * - Code exchange and refresh `POST /v2/oauth/token/`, form-encoded:
 *   https://developers.tiktok.com/docs/en/oauth-get-a-user-access-token
 *   https://developers.tiktok.com/docs/en/oauth-refresh-a-user-access-token
 * - The refresh response carries a NEW `refresh_token` and the old one stops
 *   working; lifetimes come from `expires_in` / `refresh_expires_in` (the docs
 *   quote 2 hours and 180 days but tell to read the fields), so nothing here
 *   hardcodes them:
 *   https://developers.tiktok.com/docs/en/oauth-user-access-token-management
 * - Revoke `POST /v2/oauth/revoke/` (client_key, client_secret, token):
 *   https://developers.tiktok.com/docs/en/oauth-revoke-a-user-access-token
 * - `GET /v2/user/info/?fields=open_id,avatar_url,display_name` needs
 *   `user.info.basic` (`username` would need `user.info.profile`, not requested):
 *   https://developers.tiktok.com/docs/en/tiktok-api-v2-get-user-info
 * UNVERIFIED: the exact `error` value of a refresh token that expired or was
 * revoked (treated as `invalid_grant`, the OAuth standard code).
 */

const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/"
const REQUEST_TIMEOUT_MS = 30_000
const HTTP_SERVER_ERROR = 500
const MILLISECONDS = 1000
const AUTH_ERRORS: ReadonlySet<string> = new Set([
  "invalid_grant",
  "access_token_invalid",
  "scope_not_authorized",
])

export type TiktokPublishingSettings = {
  clientId: string
  clientSecret: string
}

type TiktokTokenSet = {
  accessToken: string
  expiresAt: Date
  openId: string
  refreshToken: string
  refreshTokenExpiresAt: Date
  scopes: string[]
}

/**
 * UTF-8 base64url without `Buffer`: this module is reached by the builder's
 * router graph (Edge instrumentation bundle, invariant 25).
 */
const encodeBase64Url = (text: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")

export const generateTiktokPublishingAuthUrl = (input: {
  clientId: string
  redirectUrl: string
  stateParams: Record<string, unknown>
}): string => {
  const params = new URLSearchParams({
    client_key: input.clientId,
    redirect_uri: input.redirectUrl,
    response_type: "code",
    scope: SOCIAL_PROVIDER_CAPABILITIES.tiktok.requiredScopes.join(","),
    // Always show TikTok's authorization page instead of silently reusing a
    // signed-in session (TikTok does not document the default), as the inbox
    // connect does. https://developers.tiktok.com/docs/en/login-kit-web
    disable_auto_auth: "1",
    state: encodeBase64Url(JSON.stringify(input.stateParams)),
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

type TokenResponse = {
  access_token?: string
  error?: string
  error_description?: string
  expires_in?: number
  open_id?: string
  refresh_expires_in?: number
  refresh_token?: string
  scope?: string
}

const postForm = async (
  path: string,
  fields: Record<string, string>,
): Promise<{ body: TokenResponse; status: number }> => {
  try {
    const response = await fetch(`${TIKTOK_OPEN_API}${path}`, {
      body: new URLSearchParams(fields).toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const text = await response.text()
    let body: TokenResponse = {}
    try {
      body = text ? (JSON.parse(text) as TokenResponse) : {}
    } catch {
      body = {}
    }
    return { body, status: response.status }
  } catch {
    throw new ChannelError(
      "TikTok could not be reached.",
      ChannelErrorCategory.NETWORK_ERROR,
    )
  }
}

/** Never includes the secret or a token: only TikTok's own error code. */
const errorOf = (body: TokenResponse, status: number): ChannelError => {
  const code = body.error ?? `http_${status}`
  if (AUTH_ERRORS.has(code)) {
    return new ChannelError(
      `TikTok rejected the credentials (${code}).`,
      ChannelErrorCategory.AUTH_FAILED,
    )
  }
  return new ChannelError(
    `TikTok refused the request (${code}).`,
    status >= HTTP_SERVER_ERROR
      ? ChannelErrorCategory.NETWORK_ERROR
      : ChannelErrorCategory.UNKNOWN,
  )
}

const toTokenSet = (body: TokenResponse, now: Date): TiktokTokenSet => {
  if (
    !(
      body.access_token &&
      body.refresh_token &&
      body.open_id &&
      typeof body.expires_in === "number" &&
      typeof body.refresh_expires_in === "number"
    )
  ) {
    throw new ChannelError(
      "TikTok returned an incomplete token response.",
      ChannelErrorCategory.UNKNOWN,
    )
  }
  return {
    accessToken: body.access_token,
    expiresAt: new Date(now.getTime() + body.expires_in * MILLISECONDS),
    openId: body.open_id,
    refreshToken: body.refresh_token,
    refreshTokenExpiresAt: new Date(
      now.getTime() + body.refresh_expires_in * MILLISECONDS,
    ),
    scopes: (body.scope ?? "").split(",").filter(Boolean),
  }
}

const exchangeTiktokPublishingCode = async (
  settings: TiktokPublishingSettings,
  code: string,
  redirectUrl: string,
): Promise<TiktokTokenSet> => {
  const { body, status } = await postForm("/v2/oauth/token/", {
    client_key: settings.clientId,
    client_secret: settings.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUrl,
  })
  if (status >= HTTP_SERVER_ERROR || body.error || !body.access_token) {
    throw errorOf(body, status)
  }
  return toTokenSet(body, new Date())
}

/** Exchanges the refresh token. The response's refresh token REPLACES the one sent. */
export const refreshTiktokPublishingToken = async (
  settings: TiktokPublishingSettings,
  refreshToken: string,
): Promise<TiktokTokenSet> => {
  const { body, status } = await postForm("/v2/oauth/token/", {
    client_key: settings.clientId,
    client_secret: settings.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  })
  if (status >= HTTP_SERVER_ERROR || body.error || !body.access_token) {
    throw errorOf(body, status)
  }
  return toTokenSet(body, new Date())
}

/** Best effort: the caller disconnects the account locally whatever TikTok answers. */
export const revokeTiktokPublishingToken = async (
  settings: TiktokPublishingSettings,
  accessToken: string,
): Promise<void> => {
  const { body, status } = await postForm("/v2/oauth/revoke/", {
    client_key: settings.clientId,
    client_secret: settings.clientSecret,
    token: accessToken,
  })
  if (status >= HTTP_SERVER_ERROR || body.error) {
    throw errorOf(body, status)
  }
}

type UserInfoResponse = {
  data?: {
    user?: { avatar_url?: string; display_name?: string; open_id?: string }
  }
  error?: { code?: string }
}

export type TiktokUserInfo = {
  avatarUrl: string | null
  displayName: string
  openId: string
}

/** Reads the identity behind a token; throws an auth error for a rejected token. */
export const getTiktokUserInfo = async (
  accessToken: string,
): Promise<TiktokUserInfo> => {
  let response: Response
  try {
    response = await fetch(
      `${TIKTOK_OPEN_API}/v2/user/info/?fields=open_id,avatar_url,display_name`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    )
  } catch {
    throw new ChannelError(
      "TikTok could not be reached.",
      ChannelErrorCategory.NETWORK_ERROR,
    )
  }
  let body: UserInfoResponse = {}
  try {
    body = (await response.json()) as UserInfoResponse
  } catch {
    body = {}
  }
  const code = body.error?.code
  if (code && code !== "ok") {
    throw errorOf({ error: code }, response.status)
  }
  const user = body.data?.user
  if (!user?.open_id) {
    throw errorOf({ error: "invalid_response" }, response.status)
  }
  return {
    avatarUrl: user.avatar_url ?? null,
    displayName: user.display_name ?? user.open_id,
    openId: user.open_id,
  }
}

/**
 * Finishes the TikTok connect from TikTok's own answers: the granted scopes come
 * from the token response (so a withheld permission is reported by name), and the
 * one `profile` destination is the account itself.
 */
export const connectTiktokSocialAccount = async (input: {
  callbackUrl: string
  code: string
  settings: TiktokPublishingSettings
}): Promise<ConnectedSocialAccount> => {
  const tokens = await exchangeTiktokPublishingCode(
    input.settings,
    input.code,
    input.callbackUrl,
  )
  const user = await getTiktokUserInfo(tokens.accessToken)
  return {
    accessToken: tokens.accessToken,
    avatar: user.avatarUrl,
    destinations: [
      {
        accessToken: null,
        avatar: user.avatarUrl,
        externalId: tokens.openId,
        isActive: true,
        kind: "profile",
        name: user.displayName,
        username: null,
      },
    ],
    displayName: user.displayName,
    externalAccountId: tokens.openId,
    grantedScopes: tokens.scopes,
    provider: "tiktok",
    refreshToken: tokens.refreshToken,
    tokenExpiresAt: tokens.expiresAt,
    username: null,
  }
}
