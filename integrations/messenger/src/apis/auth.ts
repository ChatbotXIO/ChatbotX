import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type { FacebookPage } from "../schema"

type FacebookBusiness = { id: string; name: string }

const MAX_PAGES = 20

/**
 * Exhausts a Graph API cursor-paginated edge, following `paging.next` /
 * `paging.cursors.after` until pages run out or MAX_PAGES is hit.
 */
async function fetchAllPages<T>(
  endpoint: string,
  fields: string,
  accessToken: string,
): Promise<T[]> {
  const results: T[] = []
  let cursor: string | undefined
  let pageCount = 0

  while (pageCount < MAX_PAGES) {
    const res: {
      data: T[]
      paging?: { cursors?: { after?: string }; next?: string }
    } = await facebookGraphClient.get(endpoint, {
      searchParams: {
        fields,
        access_token: accessToken,
        ...(cursor ? { after: cursor } : {}),
      },
    })
    results.push(...res.data)
    pageCount++
    cursor = res.paging?.next ? res.paging.cursors?.after : undefined
    if (!cursor) {
      break
    }
  }
  return results
}

function getUserBusinesses(
  userAccessToken: string,
  version: string,
): Promise<FacebookBusiness[]> {
  return fetchAllPages<FacebookBusiness>(
    `${version}/me/businesses`,
    "id,name",
    userAccessToken,
  )
}

async function getBusinessPages(
  businessId: string,
  userAccessToken: string,
  version: string,
): Promise<FacebookPage[]> {
  const fields = "id,name,access_token,category,tasks"
  const [owned, client] = await Promise.all([
    fetchAllPages<FacebookPage>(
      `${version}/${businessId}/owned_pages`,
      fields,
      userAccessToken,
    ),
    fetchAllPages<FacebookPage>(
      `${version}/${businessId}/client_pages`,
      fields,
      userAccessToken,
    ),
  ])
  return [...owned, ...client]
}

/**
 * Pages reachable only through a Business Manager role (not a direct page
 * role) are invisible to /me/accounts. Best-effort: any failure here (user
 * not in a Business Manager, missing permission, Graph error) falls back to
 * an empty list rather than blocking the direct-accounts result.
 */
async function getBusinessManagedPages(
  userAccessToken: string,
  version: string,
): Promise<FacebookPage[]> {
  try {
    const businesses = await getUserBusinesses(userAccessToken, version)
    const pagesPerBusiness = await Promise.all(
      businesses.map((business) =>
        getBusinessPages(business.id, userAccessToken, version).catch(
          (error) => {
            logger.warn(
              error,
              `Failed to fetch BM pages for business ${business.id}`,
            )
            return []
          },
        ),
      ),
    )
    return pagesPerBusiness.flat()
  } catch (error) {
    logger.warn(
      error,
      "Failed to fetch Business Manager pages, falling back to direct accounts",
    )
    return []
  }
}

const FACEBOOK_OAUTH_BASE = "https://www.facebook.com"

const MESSENGER_SCOPES = [
  "email",
  "public_profile",
  "pages_manage_ads",
  "pages_manage_metadata",
  "pages_read_engagement",
  "pages_read_user_content",
  "pages_manage_posts",
  "pages_manage_engagement",
  "pages_messaging",
  "pages_show_list",
  "business_management",
  "pages_utility_messaging",
]

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
    scope: MESSENGER_SCOPES.join(","),
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
    const res: { access_token: string } = await facebookGraphClient.get(
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

export async function getUserPages(
  userAccessToken: string,
  version: string = DEFAULT_API_VERSION,
): Promise<FacebookPage[]> {
  const directPagesEndpoint = `${version}/me/accounts`
  const directPages = await rescue(directPagesEndpoint, async () => {
    const res: { data: FacebookPage[] } = await facebookGraphClient.get(
      directPagesEndpoint,
      {
        searchParams: {
          fields: "id,name,access_token,category,tasks",
          access_token: userAccessToken,
        },
      },
    )
    return res.data
  })

  const businessPages = await getBusinessManagedPages(userAccessToken, version)

  const merged = new Map<string, FacebookPage>()
  for (const page of directPages) {
    merged.set(page.id, page)
  }
  for (const page of businessPages) {
    if (page.access_token && !merged.has(page.id)) {
      merged.set(page.id, page)
    }
  }
  return Array.from(merged.values())
}
