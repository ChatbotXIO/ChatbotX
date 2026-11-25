import { INSTAGRAM_BUSINESS_SCOPES } from "../constants"
import { InstagramException, rescue } from "../exception"
import {
  instagramBusinessClient,
  instagramOAuthClient,
} from "../lib/http-client"
import { logger } from "../lib/logger"

export const INSTAGRAM_OAUTH_AUTHORIZE_URL =
  "https://www.instagram.com/oauth/authorize"

// Meta's Graph API renamed the Creator account_type value from "CREATOR" to
// "MEDIA_CREATOR" — accept both so existing and newly connected Creator
// accounts are not rejected as unsupported.
const VALID_ACCOUNT_TYPES = ["BUSINESS", "CREATOR", "MEDIA_CREATOR"] as const

export type InstagramAccount = {
  id: string
  name: string
  username: string
  userId: string
  profile_picture_url?: string
  accessToken: string
}

export function generateAuthUrl({
  clientId,
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
    response_type: "code",
    state: Buffer.from(JSON.stringify(stateParams ?? {})).toString("base64"),
    scope: INSTAGRAM_BUSINESS_SCOPES.join(","),
  })
  return `${INSTAGRAM_OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

export type InstagramCodeExchange = {
  accessToken: string
  /** Permissions the Business Login token exchange reports; null when absent. */
  grantedScopes: string[] | null
  userId: string
}

type RawCodeExchangeEntry = {
  access_token: string
  permissions?: string | string[]
  user_id: string | number
}

const parsePermissions = (
  permissions: string | string[] | undefined,
): string[] | null => {
  if (permissions === undefined) {
    return null
  }
  const list =
    typeof permissions === "string" ? permissions.split(",") : permissions
  const scopes = list.map((scope) => scope.trim()).filter(Boolean)
  return scopes.length > 0 ? scopes : null
}

/**
 * The code exchange answers either with `{ data: [{ access_token, user_id,
 * permissions }] }` (documented) or with the same fields at the top level;
 * `permissions` is a comma-separated string or an array.
 */
export const readCodeExchange = (response: {
  data?: RawCodeExchangeEntry[]
  access_token?: string
  permissions?: string | string[]
  user_id?: string | number
}): InstagramCodeExchange => {
  const entry: Partial<RawCodeExchangeEntry> = response.data?.[0] ?? response
  if (!(entry.access_token && entry.user_id)) {
    throw new Error("Instagram code exchange returned no access token")
  }
  return {
    accessToken: entry.access_token,
    grantedScopes: parsePermissions(entry.permissions),
    userId: String(entry.user_id),
  }
}

// Step 1: exchange authorization code → short-lived user access token + user ID
// (+ the permissions the user granted, when the platform reports them)
export function exchangeCodeForToken(
  settings: { clientId: string; clientSecret: string; version?: string },
  code: string,
  redirectUrl: string,
): Promise<InstagramCodeExchange> {
  const endpoint = "oauth/access_token"

  return rescue(endpoint, async () => {
    const exchanged = readCodeExchange(
      await instagramOAuthClient.post(endpoint, {
        body: new URLSearchParams({
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          redirect_uri: redirectUrl,
          code,
          grant_type: "authorization_code",
        }),
      }),
    )
    const longLivedToken = await exchangeLongLivedToken(
      {
        clientId: settings.clientId,
        clientSecret: settings.clientSecret,
        version: settings.version,
      },
      exchanged.accessToken,
    )
    return { ...exchanged, accessToken: longLivedToken }
  })
}

export const exchangeLongLivedToken = (
  settings: {
    clientId: string
    clientSecret: string
    version?: string
  },
  accessToken: string,
): Promise<string> => {
  const endpoint = "access_token"

  return rescue(endpoint, async () => {
    const res: { access_token: string; expires_in: number } =
      await instagramBusinessClient.get(endpoint, {
        searchParams: {
          grant_type: "ig_exchange_token",
          client_secret: settings.clientSecret,
          access_token: accessToken,
        },
      })

    return res.access_token
  })
}

export async function fetchInstagramAccount(
  userAccessToken: string,
): Promise<InstagramAccount | null> {
  const endpoint = "me"

  const res = await rescue(endpoint, async () =>
    instagramBusinessClient.get<{
      id: string
      username: string
      user_id: string
      name?: string
      profile_picture_url?: string
      account_type?: string
    }>(endpoint, {
      searchParams: {
        fields: "id,user_id,username,name,profile_picture_url,account_type",
        access_token: userAccessToken,
      },
    }),
  )

  if (
    !VALID_ACCOUNT_TYPES.includes(
      res.account_type as (typeof VALID_ACCOUNT_TYPES)[number],
    )
  ) {
    logger.warn(
      { account_type: res.account_type },
      `Instagram account is not one of the supported account types: ${VALID_ACCOUNT_TYPES.join(", ")}`,
    )
    return null
  }

  return {
    id: res.id,
    name: res.name ?? res.username,
    username: res.username,
    profile_picture_url: res.profile_picture_url,
    userId: res.user_id,
    accessToken: userAccessToken,
  }
}

/**
 * Legacy callers treat an unavailable account as a cancelled or unsupported
 * connect flow. Connection verification uses `fetchInstagramAccount` so it
 * can retain Graph error details for revocation detection.
 */
export const getInstagramAccount = async (
  userAccessToken: string,
): Promise<InstagramAccount | null> => {
  try {
    return await fetchInstagramAccount(userAccessToken)
  } catch (error) {
    if (error instanceof InstagramException) {
      logger.warn(
        { err: error },
        "Failed to fetch Instagram account during connect",
      )
      return null
    }
    throw error
  }
}
