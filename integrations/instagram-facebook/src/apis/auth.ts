import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { instagramGraphClient } from "../lib/http-client"
import { exchangeLongLivedToken } from "./page"

const FACEBOOK_OAUTH_BASE = "https://www.facebook.com"

const INSTAGRAM_SCOPES = [
  "instagram_basic",
  "instagram_manage_comments",
  "instagram_manage_engagement",
  "instagram_manage_messages",
  "instagram_manage_events",
  "pages_manage_metadata",
  "pages_show_list",
  "pages_messaging",
  "pages_read_engagement",
  "business_management",
]

export const INSTAGRAM_MANAGE_EVENTS_SCOPE = "instagram_manage_events"

export type InstagramAccount = {
  id: string
  name: string
  username: string
  profile_picture_url?: string
  pageId: string
  pageAccessToken: string
}

type FacebookPageWithIg = {
  id: string
  name: string
  access_token: string
  instagram_business_account?: { id: string }
}

type InstagramUserResponse = {
  id: string
  name: string
  username: string
  profile_picture_url?: string
}

export function generateAuthUrl({
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
    scope: INSTAGRAM_SCOPES.join(","),
    response_type: "code",
    state: btoa(JSON.stringify(stateParams ?? {})),
  })
  return `${FACEBOOK_OAUTH_BASE}/${version}/dialog/oauth?${params.toString()}`
}

export type DebugTokenData = {
  scopes?: string[]
  is_valid?: boolean
}

export function toAppAccessToken(credentials: {
  clientId: string
  clientSecret: string
}): string {
  return `${credentials.clientId}|${credentials.clientSecret}`
}

export function debugToken({
  inputToken,
  appAccessToken,
  version = DEFAULT_API_VERSION,
}: {
  inputToken: string
  appAccessToken: string
  version?: string
}): Promise<DebugTokenData> {
  const endpoint = `${version}/debug_token`

  return rescue(endpoint, async () => {
    const res: { data?: DebugTokenData } = await instagramGraphClient.get(
      endpoint,
      {
        searchParams: {
          input_token: inputToken,
        },
        headers: {
          Authorization: `Bearer ${appAccessToken}`,
        },
      },
    )
    return res.data ?? {}
  })
}

export function hasInstagramManageEventsScope(
  scopes: string[] | undefined,
): boolean {
  return Boolean(scopes?.includes(INSTAGRAM_MANAGE_EVENTS_SCOPE))
}

export function exchangeCodeForToken(
  settings: { clientId: string; clientSecret: string; version?: string },
  code: string,
  redirectUrl: string,
): Promise<string> {
  const { version = DEFAULT_API_VERSION } = settings
  const endpoint = `${version}/oauth/access_token`

  return rescue(endpoint, async () => {
    const res: { access_token: string } = await instagramGraphClient.get(
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
    return exchangeLongLivedToken(settings, res.access_token)
  })
}

export type FacebookUser = {
  id: string
  name: string
  avatarUrl?: string
}

export function getFacebookUser(
  userAccessToken: string,
  version: string = DEFAULT_API_VERSION,
): Promise<FacebookUser> {
  const endpoint = `${version}/me`

  return rescue(endpoint, async () => {
    const res: {
      id: string
      name: string
      picture?: { data?: { url?: string } }
    } = await instagramGraphClient.get(endpoint, {
      searchParams: {
        fields: "id,name,picture.width(200).height(200)",
        access_token: userAccessToken,
      },
    })
    return {
      id: res.id,
      name: res.name,
      avatarUrl: res.picture?.data?.url,
    }
  })
}

export async function getUserInstagramAccounts(
  userAccessToken: string,
  version: string = DEFAULT_API_VERSION,
): Promise<InstagramAccount[]> {
  const pagesEndpoint = `${version}/me/accounts`

  const pagesRes = await rescue(pagesEndpoint, async () => {
    const res: { data: FacebookPageWithIg[] } = await instagramGraphClient.get(
      pagesEndpoint,
      {
        searchParams: {
          fields: "id,name,access_token,instagram_business_account",
          access_token: userAccessToken,
        },
      },
    )
    return res.data
  })

  const pagesWithIg = pagesRes.filter((page) => page.instagram_business_account)

  const accounts: (InstagramAccount | null)[] = await Promise.all(
    pagesWithIg.map(async (page): Promise<InstagramAccount | null> => {
      const igId = page.instagram_business_account?.id
      if (!igId) {
        return null
      }

      const igEndpoint = `${version}/${igId}`
      try {
        const igRes: InstagramUserResponse = await rescue(
          igEndpoint,
          async () =>
            instagramGraphClient.get<InstagramUserResponse>(igEndpoint, {
              searchParams: {
                fields: "id,name,username,profile_picture_url",
                access_token: page.access_token,
              },
            }),
        )
        return {
          id: igRes.id,
          name: igRes.name,
          username: igRes.username,
          profile_picture_url: igRes.profile_picture_url,
          pageId: page.id,
          pageAccessToken: page.access_token,
        }
      } catch {
        return null
      }
    }),
  )

  return accounts.filter(
    (account): account is InstagramAccount => account !== null,
  )
}
