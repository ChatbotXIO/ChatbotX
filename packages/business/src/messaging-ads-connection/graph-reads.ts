import type { MessagingAdChannel } from "@chatbotx.io/database/partials"
import {
  type AdAccountDetails,
  type FacebookAdAccount,
  integration as facebookAdsIntegration,
  getGraphErrorCode,
  type MessagingAdInsight,
  type MetaAd,
} from "@chatbotx.io/integration-facebook-ads"
import { buildMessagingAdsContext } from "./context"
import { getOrRevalidate, messagingAdsCacheTag } from "./graph-cache"
import { messagingAdsConnectionService } from "./service"

const GRAPH_TOKEN_EXPIRED_ERROR_CODE = 190

/**
 * Runs a cached Graph read and, on a Graph 190 (expired/invalidated token),
 * flips the connection to `invalid` so the box transitions to
 * "reconnect needed" instead of silently serving stale data until the (long)
 * cache TTL elapses. Works on both the cold-miss path (error propagates to the
 * caller) AND the stale background refresh (getOrRevalidate swallows+logs the
 * throw, but this markInvalid has already fired). See Codex impl-review.
 */
async function withTokenInvalidation<T>(
  ref: {
    workspaceId: string
    channel: MessagingAdChannel
    integrationId: string
  },
  fetch: () => Promise<T>,
): Promise<T> {
  try {
    return await fetch()
  } catch (error) {
    if (getGraphErrorCode(error) === GRAPH_TOKEN_EXPIRED_ERROR_CODE) {
      // Pass only the identity fields — callers hand in the full read input
      // (adIds/adAccountId/forceRefresh), which markInvalid must not receive.
      await messagingAdsConnectionService.markInvalid({
        workspaceId: ref.workspaceId,
        channel: ref.channel,
        integrationId: ref.integrationId,
      })
    }
    throw error
  }
}

// Ad-account identity/currency/status changes rarely — cache generously and
// lean on the stale-while-revalidate refresh for freshness.
const AD_ACCOUNTS_TTL_SECONDS = 24 * 60 * 60
const AD_ACCOUNTS_STALE_AFTER_SECONDS = 60
const AD_ACCOUNT_DETAILS_TTL_SECONDS = 24 * 60 * 60
const AD_ACCOUNT_DETAILS_STALE_AFTER_SECONDS = 5 * 60
// effective_status can change quickly (Meta review, delivery pausing) — kept
// short-lived.
const ADS_STATUS_TTL_SECONDS = 10 * 60
const ADS_STATUS_STALE_AFTER_SECONDS = 20
// Ads Insights (performance) — a live Meta metrics read, so short-lived like
// effective_status; ~10min TTL keeps the box from hammering Graph on every
// render, ~60s stale-after means a manual "Refresh" still feels responsive.
const ADS_INSIGHTS_TTL_SECONDS = 10 * 60
const ADS_INSIGHTS_STALE_AFTER_SECONDS = 60
const DEFAULT_INSIGHTS_DATE_PRESET = "maximum"

type MessagingAdsIntegrationRef = {
  workspaceId: string
  channel: MessagingAdChannel
  integrationId: string
  forceRefresh?: boolean
}

const scopeOf = (input: {
  channel: MessagingAdChannel
  integrationId: string
}) => `${input.channel}:${input.integrationId}`

/** Cached ad-account list for one integration's connection — through the SWR cache described in out/plan/ctwa-ctm-ctid-box-merge.md Phase 2/v3 correction #7. */
export function listCachedMessagingAdAccounts(
  input: MessagingAdsIntegrationRef,
): Promise<FacebookAdAccount[]> {
  const scope = scopeOf(input)
  return getOrRevalidate({
    key: `msgads:ad-accounts:${scope}`,
    scope,
    ttlSeconds: AD_ACCOUNTS_TTL_SECONDS,
    staleAfterSeconds: AD_ACCOUNTS_STALE_AFTER_SECONDS,
    tags: [messagingAdsCacheTag(scope)],
    forceRefresh: input.forceRefresh,
    fetch: () =>
      withTokenInvalidation(input, async () => {
        const ctx = await buildMessagingAdsContext(input)
        return facebookAdsIntegration.runAction("getAdAccounts", { ctx })
      }),
  })
}

export function getCachedMessagingAdAccountDetails(
  input: MessagingAdsIntegrationRef & { adAccountId: string },
): Promise<AdAccountDetails> {
  const scope = scopeOf(input)
  return getOrRevalidate({
    key: `msgads:ad-account-details:${scope}:${input.adAccountId}`,
    scope,
    ttlSeconds: AD_ACCOUNT_DETAILS_TTL_SECONDS,
    staleAfterSeconds: AD_ACCOUNT_DETAILS_STALE_AFTER_SECONDS,
    tags: [messagingAdsCacheTag(scope)],
    forceRefresh: input.forceRefresh,
    fetch: () =>
      withTokenInvalidation(input, async () => {
        const ctx = await buildMessagingAdsContext(input)
        return facebookAdsIntegration.runAction("getAdAccountDetails", {
          ctx,
          props: { adAccountId: input.adAccountId },
        })
      }),
  })
}

/** Cached `effective_status` batch read for the list view — keyed by a STABLE SORTED ad-id list (v3 correction #7) so the same set of ads always resolves to the same cache key regardless of DB row order. */
export function listCachedMessagingAdsEffectiveStatus(
  input: MessagingAdsIntegrationRef & { adIds: string[] },
): Promise<MetaAd[]> {
  const scope = scopeOf(input)
  const sortedAdIds = [...input.adIds].sort()
  return getOrRevalidate({
    key: `msgads:ads-status:${scope}:${sortedAdIds.join(",")}`,
    scope,
    ttlSeconds: ADS_STATUS_TTL_SECONDS,
    staleAfterSeconds: ADS_STATUS_STALE_AFTER_SECONDS,
    tags: [messagingAdsCacheTag(scope)],
    forceRefresh: input.forceRefresh,
    fetch: () =>
      withTokenInvalidation(input, async () => {
        const ctx = await buildMessagingAdsContext(input)
        return facebookAdsIntegration.runAction("listMessagingAdsByIds", {
          ctx,
          props: { adIds: input.adIds },
        })
      }),
  })
}

/**
 * Cached Ads Insights (impressions/reach/spend/clicks/messaging conversations
 * started/cost-per-conversation) for the box's separate "Ads Insights"
 * panel — deliberately NOT part of `listCachedMessagingAdsEffectiveStatus` or
 * `messagingAdCampaignService.list()` (out/plan "insights load via a
 * SEPARATE API call so the ads LIST stays fast"). Keyed by a STABLE SORTED
 * ad-id list + `datePreset` (mirrors the effective-status cache) so the same
 * request always resolves to the same cache key regardless of caller-side
 * ordering.
 *
 * `adAccountId` is required here even though the box's identity is
 * `(channel, integrationId)`: Meta's `/insights` endpoint is inherently
 * scoped to ONE ad account (`GET /act_{adAccountId}/insights`), and a
 * `MessagingAdOperation` records its ad account per-row (the wizard lets a
 * workspace pick a different ad account per ad), so there is no single
 * "the box's ad account" to infer server-side. Callers with ads spread
 * across more than one ad account call this once per distinct ad account —
 * still never once per AD, so the "no N+1" guarantee holds per ad account.
 */
export function listCachedMessagingAdsInsights(
  input: MessagingAdsIntegrationRef & {
    adAccountId: string
    adIds: string[]
    datePreset?: string
  },
): Promise<MessagingAdInsight[]> {
  if (input.adIds.length === 0) {
    return Promise.resolve([])
  }
  const scope = scopeOf(input)
  const sortedAdIds = [...input.adIds].sort()
  const datePreset = input.datePreset ?? DEFAULT_INSIGHTS_DATE_PRESET
  return getOrRevalidate({
    key: `msgads:ads-insights:${scope}:${input.adAccountId}:${datePreset}:${sortedAdIds.join(",")}`,
    scope,
    ttlSeconds: ADS_INSIGHTS_TTL_SECONDS,
    staleAfterSeconds: ADS_INSIGHTS_STALE_AFTER_SECONDS,
    tags: [messagingAdsCacheTag(scope)],
    forceRefresh: input.forceRefresh,
    fetch: () =>
      withTokenInvalidation(input, async () => {
        const ctx = await buildMessagingAdsContext(input)
        return facebookAdsIntegration.runAction("getMessagingAdsInsights", {
          ctx,
          props: {
            adAccountId: input.adAccountId,
            adIds: input.adIds,
            channel: input.channel,
            datePreset,
          },
        })
      }),
  })
}
