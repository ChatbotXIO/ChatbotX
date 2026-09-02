import {
  type AdsEligibleChannel,
  adsConversionService,
  buildMessagingAdsContext,
  type CapiDeliverySummary,
  filterAdAccountsByIds,
  isAdsEligibleChannel,
} from "@chatbotx.io/business"
import type { AdsConversionChannel } from "@chatbotx.io/database/schema"
import { mapWithConcurrency } from "@chatbotx.io/utils"
import {
  type FacebookAdsContext,
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
import { parseAnalyticsDateRange } from "../schema/analytics"
import {
  type AdAccountSource,
  type ChannelAdAccount,
  resolveChannelAdAccountSources,
} from "./channel-ad-accounts"

type AdsAnalyticsRange = {
  from: string
  to: string
  // Viewer's IANA timezone (from the `tz` URL param) — resolved by
  // `parseAnalyticsDateRange`/`resolveTimezone` to exact UTC instants for
  // every DB-backed query below. Omitted/invalid resolves to "UTC", the
  // pre-migration behavior.
  tz?: string
  adAccount?: string
  integrationWhatsappId?: string
  // `channel`/`integrationMessengerId`/`integrationInstagramId` widen this
  // beyond WhatsApp (Phase 6 analytics UI) — additive next to
  // `integrationWhatsappId`, omitted keeps whatsapp-only behavior unchanged
  // (mirrors `GetCtwaFunnelInput`/`ctwaFunnelShape` in the business layer).
  channel?: AdsConversionChannel
  integrationMessengerId?: string
  integrationInstagramId?: string
  // "All channels" (Ads Analytics default) — the page resolves `channel ===
  // "all"` into this SEPARATE flag before ever building this range, so
  // `channel`/every integration id above are always undefined when this is
  // true (see `page.tsx`'s `analyticsRange`).
  allChannels?: boolean
}

const AD_ACCOUNT_ID_RE = /^act_\d+$/

/**
 * Channel/integration scoping fields shared by every `adsConversionService`
 * call in this file (`getCtwaFunnel`, `getCapiDeliverySummary`,
 * `getCtwaFunnelTimeseries`) — lifted straight off `range` unchanged.
 */
function channelScope(range: AdsAnalyticsRange) {
  return {
    integrationWhatsappId: range.integrationWhatsappId,
    channel: range.channel,
    integrationMessengerId: range.integrationMessengerId,
    integrationInstagramId: range.integrationInstagramId,
    allChannels: range.allChannels,
  }
}

/**
 * The one channel-integration id selected on `range`, whichever channel's FK
 * column it landed in — same "pick whichever of the three is set" shape
 * `channelScope` already threads to the funnel side; this is its spend-side
 * counterpart (Codex HIGH-3) for `resolveSelectedAdAccounts`'s
 * `integrationId` narrowing.
 */
function selectedIntegrationId(range: AdsAnalyticsRange): string | undefined {
  return (
    range.integrationWhatsappId ??
    range.integrationMessengerId ??
    range.integrationInstagramId
  )
}

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
  selectedAdAccounts: ChannelAdAccount[]
  adAccountFilterApplied: boolean
  channel: AdsEligibleChannel
}

/**
 * Resolves the ad accounts reachable for one channel — the UNION of every
 * connected integration's `MessagingAdsConnection` plus the workspace-wide
 * `IntegrationFacebookAds` fallback (`resolveChannelAdAccountSources`),
 * narrowed by `adAccountId` when it matches a listed account. Returns `null`
 * when the range has no resolvable ads-eligible channel or the account list
 * fails to load — callers should treat that as "no insights, no filter".
 *
 * Supersedes the retired Phase-6 "dashboard reads ONLY the workspace-wide
 * connection" contract: a workspace connected ONLY through a box (no
 * separate Facebook Ads integration) now yields spend too — see the
 * `adsCampaign.box.emptyDashboardNote` copy, now shown as the dashboard hint
 * on the Click to Message Ads tool page, updated to match.
 */
async function resolveSelectedAdAccounts(input: {
  workspaceId: string
  channel?: AdsConversionChannel
  integrationId?: string
  adAccountId?: string
}): Promise<SelectedAdAccounts | null> {
  if (!isAdsEligibleChannel(input.channel)) {
    return null
  }

  try {
    const accounts = await resolveChannelAdAccountSources({
      workspaceId: input.workspaceId,
      channel: input.channel,
      integrationId: input.integrationId,
    })
    const selectedAdAccounts = filterAdAccountsByIds(
      accounts,
      input.adAccountId ? [input.adAccountId] : null,
    )
    const adAccountFilterApplied = Boolean(
      input.adAccountId && selectedAdAccounts.length > 0,
    )
    return {
      selectedAdAccounts,
      adAccountFilterApplied,
      channel: input.channel,
    }
  } catch (error) {
    logger.warn(
      { err: error, workspaceId: input.workspaceId, channel: input.channel },
      "Failed to load ad account list for Ads analytics",
    )
    return null
  }
}

/**
 * Routes each selected account's spend fetch to a token that can see it
 * (Codex HIGH-2/HIGH-4): groups by the account's FIRST source (dedup keeps
 * every source, but the first listing source wins for routing), and
 * memoizes ONE context resolution per distinct source — a full cache hit
 * across every account in a source never re-resolves that source's context.
 * Returns a per-account `getContext` for `getCachedAdInsights`/
 * `getCachedDailyAdInsights`, which both accept any resolver of the shared
 * `IntegrationContext<FacebookAdsAuthValue>` shape (workspace
 * `getFacebookAdsContext` and box `buildMessagingAdsContext` both produce
 * it) — never resolved here eagerly, only handed through.
 */
function buildContextResolverBySource(input: {
  workspaceId: string
  channel: AdsEligibleChannel
}): (source: AdAccountSource | undefined) => () => Promise<FacebookAdsContext> {
  const bySourceKey = new Map<string, () => Promise<FacebookAdsContext>>()

  return (source) => {
    const resolvedSource: AdAccountSource = source ?? { kind: "workspace" }
    const key =
      resolvedSource.kind === "workspace"
        ? "workspace"
        : `messaging:${resolvedSource.integrationId}`

    const existing = bySourceKey.get(key)
    if (existing) {
      return existing
    }

    const resolver = memoizeOnce(() =>
      resolvedSource.kind === "workspace"
        ? getFacebookAdsContext(input.workspaceId)
        : buildMessagingAdsContext({
            workspaceId: input.workspaceId,
            channel: input.channel,
            integrationId: resolvedSource.integrationId,
          }),
    )
    bySourceKey.set(key, resolver)
    return resolver
  }
}

async function listInsightsForConnectedAdAccounts(input: {
  workspaceId: string
  channel?: AdsConversionChannel
  integrationId?: string
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
  const { selectedAdAccounts, adAccountFilterApplied, channel } = resolved

  // One memoized context resolution PER SOURCE shared across the whole
  // fan-out (HIGH-4) instead of once per account; bounded concurrency
  // (HIGH-3) instead of an unbounded Promise.allSettled over every connected
  // account. The global concurrency bound applies across every source at
  // once (one mapWithConcurrency call over the whole selection), not
  // per-source.
  const resolveContext = buildContextResolverBySource({
    workspaceId: input.workspaceId,
    channel,
  })
  const results = await mapWithConcurrency(
    selectedAdAccounts,
    AD_INSIGHTS_FETCH_CONCURRENCY,
    (account) =>
      getCachedAdInsights({
        workspaceId: input.workspaceId,
        adAccountId: account.id,
        since: input.since,
        until: input.until,
        getContext: resolveContext(account.sources[0]),
      }),
  )

  const insights = results.flatMap((result, index) => {
    if (result.status === "fulfilled") {
      return result.value.map((row) => ({
        adId: row.ad_id,
        adName: row.ad_name,
        currency: row.account_currency ?? null,
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
  channel?: AdsConversionChannel
  integrationId?: string
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
  const { selectedAdAccounts, adAccountFilterApplied, channel } = resolved

  // Same HIGH-3/HIGH-4 treatment as listInsightsForConnectedAdAccounts: one
  // memoized context per source shared across the fan-out, bounded
  // concurrency across the whole selection.
  const resolveContext = buildContextResolverBySource({
    workspaceId: input.workspaceId,
    channel,
  })
  const results = await mapWithConcurrency(
    selectedAdAccounts,
    AD_INSIGHTS_FETCH_CONCURRENCY,
    (account) =>
      getCachedDailyAdInsights({
        workspaceId: input.workspaceId,
        adAccountId: account.id,
        since: input.since,
        until: input.until,
        getContext: resolveContext(account.sources[0]),
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
      ...channelScope(range),
    }),
    // `from`/`to` here are still raw date-KEYS (not the resolved UTC
    // instants) — Meta Graph API's `insights` endpoint interprets them in
    // the AD ACCOUNT's own reporting timezone, not the viewer's. This is
    // unavoidable (no per-request override) and deliberately unchanged by
    // the viewer-timezone migration — see the "RESIDUAL SEAM" note in
    // `ads-date-key.ts`.
    listInsightsForConnectedAdAccounts({
      workspaceId,
      channel: range.channel,
      integrationId: selectedIntegrationId(range),
      since: from,
      until: to,
      adAccountId,
    }),
  ])

  return mergeAdsAnalytics({
    funnel,
    insights: insightsResult.insights,
    integrationFilterActive: Boolean(
      range.integrationWhatsappId ||
        range.integrationMessengerId ||
        range.integrationInstagramId,
    ),
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
    ...channelScope(range),
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
  const { since, until, from, to, timezone } = parseAnalyticsDateRange(range)
  const adAccountId = AD_ACCOUNT_ID_RE.test(range.adAccount ?? "")
    ? range.adAccount
    : undefined

  const [funnelRows, dailyInsightsResult] = await Promise.all([
    adsConversionService.getCtwaFunnelTimeseries({
      workspaceId,
      since,
      until,
      timezone,
      ...channelScope(range),
    }),
    // `from`/`to` date-KEYS, interpreted by Meta in the ad account's own
    // reporting timezone — see the comment in `getAdsAnalyticsData` above.
    listDailyInsightsForConnectedAdAccounts({
      workspaceId,
      channel: range.channel,
      integrationId: selectedIntegrationId(range),
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
