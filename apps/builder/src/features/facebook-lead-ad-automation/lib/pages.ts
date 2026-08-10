import "server-only"

import { messengerIntegrationService } from "@chatbotx.io/business"
import {
  debugToken,
  hasLeadsRetrieval,
  toAppAccessToken,
} from "@chatbotx.io/integration-messenger/apis/auth"
import {
  getLeadgenForms,
  type LeadgenForm,
} from "@chatbotx.io/integration-messenger/apis/leadgen"
import {
  LEAD_ADS_PAGE_SUBSCRIBE_FIELDS,
  subscribePageToAppWebhook,
} from "@chatbotx.io/integration-messenger/apis/page"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger/schema"

export type LeadAdsPage = {
  pageId: string
  pageName: string
  /** Whether the page's Messenger token carries `leads_retrieval`. */
  eligible: boolean
}

/**
 * Whether a page's stored Messenger token is still live AND currently carries
 * `leads_retrieval`.
 *
 * The app access token comes from the integration's OWN stored
 * `clientId`/`clientSecret` — the Facebook app that actually minted this page
 * token. Re-resolving the owner's *current* platform credential instead would
 * disagree with it whenever the platform credential has been rotated or a
 * reseller's tenant has gone inactive (`resolveForOwner` then falls back to the
 * platform default app), and Graph answers "(#100) The token provided is not for
 * this app" for every page — an unbreakable loop, since no amount of re-consent
 * changes which app issued the stored token.
 *
 * `is_valid` is checked alongside the scopes: Facebook answers HTTP 200 with a
 * populated `scopes` array for tokens that have since expired or been revoked, so
 * scopes alone would report a dead page as eligible, hide the re-auth prompt, and
 * let `subscribePageLeadgen` fail later with a generic Graph error.
 */
async function isTokenLeadEligible(auth: MessengerAuthValue): Promise<boolean> {
  if (!(auth.clientId && auth.clientSecret)) {
    // Cannot inspect the token without the minting app's credentials. Report
    // ineligible so the UI offers the re-auth, rather than throwing and dropping
    // the page from the list entirely.
    return false
  }

  const data = await debugToken({
    inputToken: auth.tokens.accessToken,
    appAccessToken: toAppAccessToken(auth),
    version: auth.metadata.version,
  })
  return data.is_valid !== false && hasLeadsRetrieval(data.scopes)
}

/**
 * Workspace's connected Messenger pages, each flagged eligible when its page
 * token already carries `leads_retrieval` (checked via /debug_token). Ineligible
 * pages prompt the "Add New" re-auth in the UI.
 */
export async function listEligibleLeadAdsPages(
  workspaceId: string,
): Promise<LeadAdsPage[]> {
  const integrations =
    await messengerIntegrationService.findByWorkspaceId(workspaceId)
  const results = await Promise.allSettled(
    integrations.map(async (integration) => ({
      pageId: integration.pageId,
      pageName: integration.name,
      eligible: await isTokenLeadEligible(
        integration.auth as MessengerAuthValue,
      ),
    })),
  )
  return results
    .filter(
      (r): r is PromiseFulfilledResult<LeadAdsPage> => r.status === "fulfilled",
    )
    .map((r) => r.value)
}

export async function listPageLeadForms(
  workspaceId: string,
  pageId: string,
): Promise<LeadgenForm[]> {
  const integration = await messengerIntegrationService.findByPageId({
    workspaceId,
    pageId,
  })
  if (!integration) {
    return []
  }
  const auth = integration.auth as MessengerAuthValue
  return await getLeadgenForms(
    pageId,
    auth.tokens.accessToken,
    auth.metadata.version,
  )
}

/**
 * After the lead-ads re-auth grants `leads_retrieval`, subscribe every eligible
 * page to the `leadgen` webhook field. Best-effort per page.
 */
export async function enableLeadgenForWorkspacePages(
  workspaceId: string,
): Promise<void> {
  const integrations =
    await messengerIntegrationService.findByWorkspaceId(workspaceId)
  await Promise.allSettled(
    integrations.map(async (integration) => {
      const auth = integration.auth as MessengerAuthValue
      if (!(await isTokenLeadEligible(auth))) {
        return
      }
      await subscribePageToAppWebhook({
        pageId: integration.pageId,
        accessToken: auth.tokens.accessToken,
        version: auth.metadata.version,
        subscribedFields: LEAD_ADS_PAGE_SUBSCRIBE_FIELDS.join(","),
      })
    }),
  )
}

/**
 * Ensure a single page is subscribed to `leadgen` (called on automation
 * create). Throws when the page has no Messenger integration or Facebook
 * rejects the subscribe — an automation on an unsubscribed page never receives
 * a webhook, so the caller must not treat a failure here as success.
 */
export async function subscribePageLeadgen(
  workspaceId: string,
  pageId: string,
): Promise<void> {
  const integration = await messengerIntegrationService.findByPageId({
    workspaceId,
    pageId,
  })
  if (!integration) {
    throw new Error(
      `subscribePageLeadgen: no Messenger integration for page ${pageId}`,
    )
  }
  const auth = integration.auth as MessengerAuthValue
  await subscribePageToAppWebhook({
    pageId,
    accessToken: auth.tokens.accessToken,
    version: auth.metadata.version,
    subscribedFields: LEAD_ADS_PAGE_SUBSCRIBE_FIELDS.join(","),
  })
}
