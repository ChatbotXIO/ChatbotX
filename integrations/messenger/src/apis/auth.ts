import { fetchAllCursorPages } from "@chatbotx.io/utils"
import { DEFAULT_API_VERSION } from "../constants"
import { MessengerAPIException, rescue } from "../exception"
import {
  facebookGraphClient,
  isDataTooLargeGraphError,
} from "../lib/http-client"
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
/**
 * Page sizes tried for `/me/accounts`, largest first. Meta rejects a page
 * whose pages carry too much data with error code 1 ("Please reduce the
 * amount of data you're asking for, then retry your request"); each retry
 * asks for less. 10 is the floor — below that the error is reported as-is.
 */
const DIRECT_PAGES_PAGE_LIMITS = [50, 25, 10] as const
/**
 * Most Facebook Pages one walk of `/me/accounts` will read, whatever the page
 * size — the same ceiling the previous fixed `limit=100 × 20 pages` gave, so
 * shrinking the page never shortens the list a user used to see.
 */
const DIRECT_PAGES_MAX_ROWS = GRAPH_PAGE_LIMIT * MAX_PAGES
const DIRECT_PAGES_FIELDS = "id,name,access_token,category,tasks"
const BUSINESS_PAGE_BATCH_SIZE = 5
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
  pagination: { limit: number; maxPages: number } = {
    limit: GRAPH_PAGE_LIMIT,
    maxPages: MAX_PAGES,
  },
): Promise<T[]> {
  return fetchAllCursorPages({
    endpoint,
    fields,
    accessToken,
    // Arrow wrapper keeps `this` bound to the client instance; passing the
    // method reference directly detaches it and crashes at call time.
    get: (pageEndpoint, options) =>
      facebookGraphClient.get(pageEndpoint, options),
    limit: pagination.limit,
    maxPages: pagination.maxPages,
  })
}

/**
 * Error code 1 with no subcode is Meta's "response too large" reply. The
 * http client deliberately does not retry it (`shouldRetryGraphRequest`) —
 * the identical request never succeeds — so the only remedy is a smaller page.
 */
function isDataTooLargeException(
  error: unknown,
): error is MessengerAPIException {
  return (
    error instanceof MessengerAPIException && isDataTooLargeGraphError(error)
  )
}

/**
 * Walks `/me/accounts` with progressively smaller pages. A retry always
 * starts over from the first page: the cursor that came with a failed walk
 * was minted for the old page size and cannot be resumed, and starting over
 * is what keeps rows read before the failure from appearing twice.
 */
async function fetchDirectPages(
  endpoint: string,
  accessToken: string,
): Promise<FacebookPage[]> {
  let lastError: unknown

  for (const limit of DIRECT_PAGES_PAGE_LIMITS) {
    try {
      return await fetchAllPages<FacebookPage>(
        endpoint,
        DIRECT_PAGES_FIELDS,
        accessToken,
        { limit, maxPages: Math.ceil(DIRECT_PAGES_MAX_ROWS / limit) },
      )
    } catch (error) {
      if (!isDataTooLargeException(error)) {
        throw error
      }
      lastError = error
      logger.warn(
        { limit, code: error.code },
        "Graph rejected /me/accounts page size, retrying from the first page with a smaller one",
      )
    }
  }

  throw lastError
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
// biome-ignore lint/correctness/noUnusedVariables: BM page lookup is temporarily disabled in getUserPages
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

export const MESSENGER_SCOPES = [
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
  "page_events",
]

/**
 * `MESSENGER_SCOPES` minus the two identity-only scopes (`email`,
 * `public_profile` are not Graph permissions and are implicitly present on
 * every token). Used to decide whether a Facebook SSO token already carries
 * every permission the Messenger connect flow would otherwise request, so the
 * page-connect step can reuse it instead of re-running OAuth.
 */
export const MESSENGER_REUSE_REQUIRED_SCOPES = MESSENGER_SCOPES.filter(
  (scope) =>
    scope !== "email" && scope !== "public_profile" && scope !== "page_events",
)

/**
 * Scopes requested by the Facebook Lead Ads "Add New" re-auth. Granting these
 * upgrades the user↔app permission set so the page's EXISTING Messenger page
 * token gains `leads_retrieval` (Facebook aggregates granted permissions per
 * user↔app pair) — no separate lead-ads token is stored.
 */
export const LEAD_ADS_SCOPES = [
  "leads_retrieval",
  "pages_manage_ads",
  "pages_manage_metadata",
  "pages_show_list",
]

export const LEADS_RETRIEVAL_SCOPE = "leads_retrieval"
export const PAGE_EVENTS_SCOPE = "page_events"

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

/**
 * OAuth dialog URL for the Facebook Lead Ads re-auth. Identical to
 * `generateAuthUrl` except it requests only `LEAD_ADS_SCOPES` — the goal is to
 * grant `leads_retrieval` on top of the page's existing Messenger permissions,
 * not to reconnect Messenger. Callers pass `flow: "facebookLeadAds"` in
 * `stateParams` so the callback short-circuits the Messenger page-picker.
 */
export function generateLeadAdsAuthUrl({
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
    scope: LEAD_ADS_SCOPES.join(","),
    response_type: "code",
    state: Buffer.from(JSON.stringify(stateParams ?? {})).toString("base64"),
  })
  return `${FACEBOOK_OAUTH_BASE}/${version}/dialog/oauth?${params.toString()}`
}

export const MARKETING_MESSAGES_SCOPE = "marketing_messages_messenger"

/**
 * OAuth dialog for the Marketing Messages grant.
 *
 * Unlike `generateLeadAdsAuthUrl` this passes NO `scope`: the permission set
 * comes from the Facebook Login for Business `config_id` configured on the
 * Messenger platform credential. `app_id` is sent alongside `client_id`
 * because the Login-for-Business dialog reads the former.
 *
 * `auth_type=rerequest` is required for the same reason it is on the catalog
 * flow: without it Facebook silently skips a previously declined permission
 * and returns a token missing `marketing_messages_messenger`, so the grant
 * looks successful and every later call fails.
 */
export function generateMarketingMessagesAuthUrl({
  clientId,
  configId,
  version = DEFAULT_API_VERSION,
  redirectUrl,
  stateParams,
}: {
  clientId: string
  configId: string
  version?: string
  redirectUrl: string
  stateParams?: Record<string, unknown>
}): string {
  const params = new URLSearchParams({
    app_id: clientId,
    client_id: clientId,
    config_id: configId,
    auth_type: "rerequest",
    override_default_response_type: "true",
    redirect_uri: redirectUrl,
    response_type: "code",
    state: Buffer.from(JSON.stringify(stateParams ?? {})).toString("base64"),
  })
  return `${FACEBOOK_OAUTH_BASE}/${version}/dialog/oauth?${params.toString()}`
}

/** Whether a `/debug_token` scope list carries the Marketing Messages grant. */
export function hasMarketingMessages(scopes?: string[]): boolean {
  return scopes?.includes(MARKETING_MESSAGES_SCOPE) ?? false
}

export type DebugTokenData = {
  scopes?: string[]
  is_valid?: boolean
}

/** App access token (`APP_ID|APP_SECRET`) for the app these credentials identify. */
export function toAppAccessToken(credentials: {
  clientId: string
  clientSecret: string
}): string {
  return `${credentials.clientId}|${credentials.clientSecret}`
}

/**
 * Inspect a token's granted scopes via `GET /debug_token`. Used to check
 * whether a page's access token carries `leads_retrieval` before offering the
 * page as a lead source.
 *
 * Named arguments on purpose: `appAccessToken` and `version` are both plain
 * strings, so a positional signature let callers pass the version where the app
 * token belongs — silently, with no type error.
 *
 * `appAccessToken` is REQUIRED and must belong to the app that minted
 * `inputToken` (build it with `toAppAccessToken`). Facebook does NOT let a page
 * token inspect itself — it answers "(#100) You must provide an app access
 * token, or a user access token that is an owner or developer of the app" — so a
 * caller that passes the inspected token here gets no scopes back at all.
 *
 * It travels in the `Authorization` header, NOT as an `access_token` query
 * param: the client logs the full request URL on any HTTP error
 * (`lib/http-client.ts` `beforeError`), which would write the Facebook app
 * secret into the logs in plaintext on every rate-limit or invalid-token reply.
 */
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
    const res: { data?: DebugTokenData } = await facebookGraphClient.get(
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

export function hasLeadsRetrieval(scopes: string[] | undefined): boolean {
  return Boolean(scopes?.includes(LEADS_RETRIEVAL_SCOPE))
}

export function hasPageEventsScope(scopes: string[] | undefined): boolean {
  return Boolean(scopes?.includes(PAGE_EVENTS_SCOPE))
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
    } = await facebookGraphClient.get(endpoint, {
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

export async function getUserPages(
  userAccessToken: string,
  version: string = DEFAULT_API_VERSION,
): Promise<{ pages: ConnectableFacebookPage[]; bmLookupFailed: boolean }> {
  const directPagesEndpoint = `${version}/me/accounts`
  const directPages = await rescue(directPagesEndpoint, () =>
    fetchDirectPages(directPagesEndpoint, userAccessToken),
  )

  // const businessPagesResult = await getBusinessManagedPages(
  //   userAccessToken,
  //   version,
  // )

  const merged = new Map<string, SourcedFacebookPage>()
  for (const page of directPages) {
    merged.set(page.id, { page, source: "direct" })
  }
  // for (const page of businessPagesResult.pages) {
  //   if (!merged.has(page.id)) {
  //     merged.set(page.id, { page, source: "business" })
  //   }
  // }

  const pages = sortConnectableFirst(
    Array.from(merged.values()).map(({ page, source }) =>
      classifyConnectable(page, source),
    ),
  )
  const nonConnectable = pages.filter((page) => !page.isConnectable).length

  logger.debug({ nonConnectable }, "Classified Messenger pages")
  // if (businessPagesResult.failed) {
  //   logger.debug("Business Manager page lookup failed")
  // } else if (businessPagesResult.pages.length === 0) {
  //   logger.debug("No Business Manager pages found")
  // }

  return { pages, bmLookupFailed: false }
}
