import {
  adsConversionService,
  type CapiDeliverySummary,
  filterAdAccountsByIds,
  integrationFacebookAdsService,
} from "@chatbotx.io/business"
import { mapWithConcurrency } from "@chatbotx.io/utils"
import {
  getCachedAdAccounts,
  getCachedAdInsights,
  getCachedDailyAdInsights,
  getFacebookAdsContext,
} from "@/features/integration-facebook-ads/queries"
import { logger } from "@/lib/log"
import {
  type AdsAnalyticsData,
  type InsightSpendRow,
  mergeAdsAnalytics,
} from "../lib/merge-analytics"
import { parseAnalyticsDateRange } from "../schemas/analytics"

type AdsAnalyticsRange = {
  from: string
  to: string
  adAccount?: string
  integrationWhatsappId?: string
}

const AD_ACCOUNT_ID_RE = /^act_\d+$/

// Facebook Graph API enforces per-access-token rate limits; capping fan-out
// keeps a workspace connected to many ad accounts from bursting past them on
// a single analytics page load (HIGH-3).
const AD_INSIGHTS_FETCH_CONCURRENCY = 5

/**
 * Wraps `fn` so it runs at most once, memoizing the in-flight/resolved
 * promise for every subsequent call (HIGH-4). Used to share ONE Facebook Ads
 * context resolution (credential fetch + AES decrypt) across an entire N-
 * account insight fan-out — a full cache hit across every account never
 * calls `fn` at all.
 */
function memoizeOnce<T>(fn: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined
  return () => (promise ??= fn())
}

type SelectedAdAccounts = {
  selectedAdAccounts: { id: string; name?: string }[]
  adAccountFilterApplied: boolean
}

/**
 * Resolves the ad accounts a workspace's Facebook Ads integration is
 * connected to, narrowed by `adAccountId` when it matches a connected
 * account. Returns `null` when there is no integration or the account list
 * fails to load — callers should treat that as "no insights, no filter".
 */
async function resolveSelectedAdAccounts(input: {
  workspaceId: string
  adAccountId?: string
}): Promise<SelectedAdAccounts | null> {
  const integration = await integrationFacebookAdsService.findByWorkspaceId(
    input.workspaceId,
  )
  if (!integration) {
    return null
  }

  try {
    const adAccounts = await getCachedAdAccounts(input.workspaceId)
    const selectedAdAccounts = filterAdAccountsByIds(
      adAccounts,
      input.adAccountId ? [input.adAccountId] : null,
    )
    const adAccountFilterApplied = Boolean(
      input.adAccountId && selectedAdAccounts.length > 0,
    )
    return { selectedAdAccounts, adAccountFilterApplied }
  } catch (error) {
    logger.warn(
      { err: error, workspaceId: input.workspaceId },
      "Failed to load Facebook Ads account list for CTWA analytics",
    )
    return null
  }
}

async function listInsightsForConnectedAdAccounts(input: {
  workspaceId: string
  since: string
  until: string
  adAccountId?: string
}): Promise<{
  insights: InsightSpendRow[]
  adAccountFilterApplied: boolean
}> {
  const resolved = await resolveSelectedAdAccounts(input)
  if (!resolved) {
    return { insights: [], adAccountFilterApplied: false }
  }
  const { selectedAdAccounts, adAccountFilterApplied } = resolved

  // One memoized context resolution shared across the whole fan-out (HIGH-4)
  // instead of once per account; bounded concurrency (HIGH-3) instead of an
  // unbounded Promise.allSettled over every connected account.
  const getContext = memoizeOnce(() => getFacebookAdsContext(input.workspaceId))
  const results = await mapWithConcurrency(
    selectedAdAccounts,
    AD_INSIGHTS_FETCH_CONCURRENCY,
    (account) =>
      getCachedAdInsights({
        workspaceId: input.workspaceId,
        adAccountId: account.id,
        since: input.since,
        until: input.until,
        getContext,
      }),
  )

  const insights = results.flatMap((result, index) => {
    if (result.status === "fulfilled") {
      return result.value.map((row) => ({
        adId: row.ad_id,
        adName: row.ad_name,
        spend: row.spend,
        impressions: row.impressions,
        clicks: row.clicks,
      }))
    }

    logger.warn(
      { err: result.reason, adAccountId: selectedAdAccounts[index]?.id },
      "Failed to load Facebook Ads insights for CTWA analytics",
    )
    return []
  })

  return { insights, adAccountFilterApplied }
}

type DailyInsightRow = {
  date: string
  adId: string
  spend: number
}

async function listDailyInsightsForConnectedAdAccounts(input: {
  workspaceId: string
  since: string
  until: string
  adAccountId?: string
}): Promise<{
  insights: DailyInsightRow[]
  adAccountFilterApplied: boolean
}> {
  const resolved = await resolveSelectedAdAccounts(input)
  if (!resolved) {
    return { insights: [], adAccountFilterApplied: false }
  }
  const { selectedAdAccounts, adAccountFilterApplied } = resolved

  // Same HIGH-3/HIGH-4 treatment as listInsightsForConnectedAdAccounts: one
  // memoized context shared across the fan-out, bounded concurrency.
  const getContext = memoizeOnce(() => getFacebookAdsContext(input.workspaceId))
  const results = await mapWithConcurrency(
    selectedAdAccounts,
    AD_INSIGHTS_FETCH_CONCURRENCY,
    (account) =>
      getCachedDailyAdInsights({
        workspaceId: input.workspaceId,
        adAccountId: account.id,
        since: input.since,
        until: input.until,
        getContext,
      }),
  )

  const insights = results.flatMap((result, index) => {
    if (result.status === "fulfilled") {
      return result.value.flatMap((row) =>
        row.date_start
          ? [{ date: row.date_start, adId: row.ad_id, spend: row.spend }]
          : [],
      )
    }

    logger.warn(
      { err: result.reason, adAccountId: selectedAdAccounts[index]?.id },
      "Failed to load daily Facebook Ads insights for CTWA analytics",
    )
    return []
  })

  return { insights, adAccountFilterApplied }
}

export async function getAdsAnalyticsData(
  workspaceId: string,
  range: AdsAnalyticsRange,
): Promise<AdsAnalyticsData> {
  const { since, until, from, to } = parseAnalyticsDateRange(range)
  const adAccountId = AD_ACCOUNT_ID_RE.test(range.adAccount ?? "")
    ? range.adAccount
    : undefined

  const [funnel, insightsResult] = await Promise.all([
    adsConversionService.getCtwaFunnel({
      workspaceId,
      since,
      until,
      integrationWhatsappId: range.integrationWhatsappId,
    }),
    listInsightsForConnectedAdAccounts({
      workspaceId,
      since: from,
      until: to,
      adAccountId,
    }),
  ])

  return mergeAdsAnalytics({
    funnel,
    insights: insightsResult.insights,
    integrationFilterActive: Boolean(range.integrationWhatsappId),
    adAccountFilterActive: insightsResult.adAccountFilterApplied,
  })
}

export function getCapiDeliveryData(
  workspaceId: string,
  range: AdsAnalyticsRange,
): Promise<CapiDeliverySummary> {
  const { since, until } = parseAnalyticsDateRange(range)

  return adsConversionService.getCapiDeliverySummary({
    workspaceId,
    since,
    until,
    integrationWhatsappId: range.integrationWhatsappId,
  })
}

export type AdsAnalyticsTimeseriesRow = {
  date: string
  conversations: number
  leads: number
  purchases: number
  spend: number | null
}

function enumerateDateKeys(from: string, to: string): string[] {
  const dates: string[] = []
  const cursor = new Date(`${from}T00:00:00.000Z`)
  const end = new Date(`${to}T00:00:00.000Z`)
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

export async function getAdsAnalyticsTimeseries(
  workspaceId: string,
  range: AdsAnalyticsRange,
): Promise<AdsAnalyticsTimeseriesRow[]> {
  const { since, until, from, to } = parseAnalyticsDateRange(range)
  const adAccountId = AD_ACCOUNT_ID_RE.test(range.adAccount ?? "")
    ? range.adAccount
    : undefined

  const [funnelRows, dailyInsightsResult] = await Promise.all([
    adsConversionService.getCtwaFunnelTimeseries({
      workspaceId,
      since,
      until,
      integrationWhatsappId: range.integrationWhatsappId,
    }),
    listDailyInsightsForConnectedAdAccounts({
      workspaceId,
      since: from,
      until: to,
      adAccountId,
    }),
  ])

  // Same survivor semantics as mergeAdsAnalytics: when an ad-account filter
  // is active, only keep funnel rows whose ad also appears in the selected
  // account's daily insights — otherwise chart and tiles would disagree.
  const survivingAdIds = dailyInsightsResult.adAccountFilterApplied
    ? new Set(dailyInsightsResult.insights.map((row) => row.adId))
    : null
  const survivingFunnelRows = survivingAdIds
    ? funnelRows.filter(
        (row) => row.adId !== null && survivingAdIds.has(row.adId),
      )
    : funnelRows

  const byDate = new Map<string, AdsAnalyticsTimeseriesRow>()
  for (const dateKey of enumerateDateKeys(from, to)) {
    byDate.set(dateKey, {
      date: dateKey,
      conversations: 0,
      leads: 0,
      purchases: 0,
      spend: null,
    })
  }

  for (const row of survivingFunnelRows) {
    const existing = byDate.get(row.date)
    if (!existing) {
      continue
    }
    byDate.set(row.date, {
      ...existing,
      conversations: existing.conversations + row.conversations,
      leads: existing.leads + row.leads,
      purchases: existing.purchases + row.purchases,
    })
  }

  for (const row of dailyInsightsResult.insights) {
    const existing = byDate.get(row.date)
    if (!existing) {
      continue
    }
    byDate.set(row.date, {
      ...existing,
      spend: (existing.spend ?? 0) + row.spend,
    })
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
