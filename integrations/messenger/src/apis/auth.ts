import { fetchAllCursorPages } from "@chatbotx.io/utils"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type { ConnectableFacebookPage, FacebookPage } from "../schema"

type FacebookBusiness = { id: string; name: string }
type FacebookPageSource = "direct" | "business"
type BusinessPagesResult = { pages: FacebookPage[]; hadFailure: boolean }
type SourcedFacebookPage = {
  page: FacebookPage
  source: FacebookPageSource
}

const MAX_PAGES = 20
const GRAPH_PAGE_LIMIT = 100
const BUSINESS_PAGE_BATCH_SIZE = 5
/**
 * Business Manager owned/client pages lookup is disabled by default:
 * a fully paginated /me/accounts already lists every page the user can
 * actually connect (pages reachable only through a BM role come back
 * without an access_token, so they could not be connected anyway).
 * Kept behind this switch so it can be re-enabled without a rewrite.
 */
const INCLUDE_BUSINESS_MANAGER_PAGES = false
const ADMIN_PAGE_TASKS = [
  "ADVERTISE",
  "ANALYZE",
  "CREATE_CONTENT",
  "MANAGE",
  "MODERATE",
]

function fetchAllPages<T>(
  endpoint: string,
  fields: string,
  accessToken: string,
): Promise<T[]> {
  return fetchAllCursorPages({
    endpoint,
    fields,
    accessToken,
    // Arrow wrapper keeps `this` bound to the client instance; passing the
    // method reference directly detaches it and crashes at call time.
    get: (pageEndpoint, options) =>
      facebookGraphClient.get(pageEndpoint, options),
    limit: GRAPH_PAGE_LIMIT,
    maxPages: MAX_PAGES,
  })
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
): Promise<BusinessPagesResult> {
  const fields = "id,name,access_token,category"
  const edges = [
    { name: "owned_pages", endpoint: `${version}/${businessId}/owned_pages` },
    { name: "client_pages", endpoint: `${version}/${businessId}/client_pages` },
  ] as const
  const edgeResults = await Promise.all(
    edges.map(async (edge) => {
      try {
        return {
          pages: await fetchAllPages<FacebookPage>(
            edge.endpoint,
            fields,
            userAccessToken,
          ),
          failed: false,
        }
      } catch (error) {
        logger.warn(
          error,
          `Failed to fetch BM ${edge.name} for business ${businessId}`,
        )
        return { pages: [], failed: true }
      }
    }),
  )

  return {
    pages: edgeResults.flatMap((result) => result.pages),
    hadFailure: edgeResults.some((result) => result.failed),
  }
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
): Promise<{ pages: FacebookPage[]; failed: boolean }> {
  try {
    const businesses = await getUserBusinesses(userAccessToken, version)
    const pagesPerBusiness: BusinessPagesResult[] = []

    for (
      let index = 0;
      index < businesses.length;
      index += BUSINESS_PAGE_BATCH_SIZE
    ) {
      const batch = businesses.slice(index, index + BUSINESS_PAGE_BATCH_SIZE)
      const batchPages = await Promise.all(
        batch.map((business) =>
          getBusinessPages(business.id, userAccessToken, version),
        ),
      )
      pagesPerBusiness.push(...batchPages)
    }

    const pages = pagesPerBusiness.flatMap((result) => result.pages)
    const hadFailure = pagesPerBusiness.some((result) => result.hadFailure)

    return { pages, failed: hadFailure && pages.length === 0 }
  } catch (error) {
    logger.warn(
      error,
      "Failed to fetch Business Manager pages, falling back to direct accounts",
    )
    return { pages: [], failed: true }
  }
}

function hasAllAdminTasks(tasks?: string[]): boolean {
  if (!tasks?.length) {
    return false
  }

  return ADMIN_PAGE_TASKS.every((task) => tasks.includes(task))
}

function classifyConnectable(
  page: FacebookPage,
  source: FacebookPageSource,
): ConnectableFacebookPage {
  const hasAccessToken = Boolean(page.access_token)

  return {
    ...page,
    isConnectable:
      source === "direct"
        ? hasAccessToken && hasAllAdminTasks(page.tasks)
        : hasAccessToken,
  }
}

function sortConnectableFirst(
  pages: ConnectableFacebookPage[],
): ConnectableFacebookPage[] {
  return [...pages].sort((current, next) => {
    if (current.isConnectable === next.isConnectable) {
      return 0
    }

    return current.isConnectable ? -1 : 1
  })
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
    auth_type: "rerequest",
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
  options: { includeBusinessManagerPages?: boolean } = {},
): Promise<{ pages: ConnectableFacebookPage[]; bmLookupFailed: boolean }> {
  const includeBusinessManagerPages =
    options.includeBusinessManagerPages ?? INCLUDE_BUSINESS_MANAGER_PAGES
  const directPagesEndpoint = `${version}/me/accounts`
  const directPages = await rescue(directPagesEndpoint, () =>
    fetchAllPages<FacebookPage>(
      directPagesEndpoint,
      "id,name,access_token,category,tasks",
      userAccessToken,
    ),
  )

  const businessPagesResult = includeBusinessManagerPages
    ? await getBusinessManagedPages(userAccessToken, version)
    : { pages: [] as FacebookPage[], failed: false }

  const merged = new Map<string, SourcedFacebookPage>()
  for (const page of directPages) {
    merged.set(page.id, { page, source: "direct" })
  }
  for (const page of businessPagesResult.pages) {
    if (!merged.has(page.id)) {
      merged.set(page.id, { page, source: "business" })
    }
  }

  const pages = sortConnectableFirst(
    Array.from(merged.values()).map(({ page, source }) =>
      classifyConnectable(page, source),
    ),
  )
  const nonConnectable = pages.filter((page) => !page.isConnectable).length

  logger.debug({ nonConnectable }, "Classified Messenger pages")
  if (includeBusinessManagerPages) {
    if (businessPagesResult.failed) {
      logger.debug("Business Manager page lookup failed")
    } else if (businessPagesResult.pages.length === 0) {
      logger.debug("No Business Manager pages found")
    }
  }

  return { pages, bmLookupFailed: businessPagesResult.failed }
}
