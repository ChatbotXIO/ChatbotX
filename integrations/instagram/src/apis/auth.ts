import { INSTAGRAM_BUSINESS_SCOPES } from "../constants"
import { InstagramException, rescue } from "../exception"
import {
  instagramBusinessClient,
  instagramOAuthClient,
} from "../lib/http-client"
import { logger } from "../lib/logger"

const INSTAGRAM_OAUTH_AUTHORIZE_URL =
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

// Step 1: exchange authorization code → short-lived user access token + user ID
export function exchangeCodeForToken(
  settings: { clientId: string; clientSecret: string; version?: string },
  code: string,
  redirectUrl: string,
): Promise<{ accessToken: string; userId: string }> {
  const endpoint = "oauth/access_token"

  return rescue(endpoint, async () => {
    const res: { access_token: string; user_id: string | number } =
      await instagramOAuthClient.post(endpoint, {
        body: new URLSearchParams({
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          redirect_uri: redirectUrl,
          code,
          grant_type: "authorization_code",
        }),
      })
    const longLivedToken = await exchangeLongLivedToken(
      {
        clientId: settings.clientId,
        clientSecret: settings.clientSecret,
        version: settings.version,
      },
      res.access_token,
    )
    return { accessToken: longLivedToken, userId: String(res.user_id) }
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

export async function getInstagramAccount(
  userAccessToken: string,
): Promise<InstagramAccount | null> {
  const endpoint = "me"

  try {
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
  } catch (error) {
    if (error instanceof InstagramException) {
      logger.warn(error, "Failed to fetch Instagram account during connect")
      return null
    }
    throw error
  }
}
