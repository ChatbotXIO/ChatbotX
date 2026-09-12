import type { AdsConversionChannel } from "@chatbotx.io/database/schema"
import { mapWithConcurrency } from "@chatbotx.io/utils"
import {
  type AdsEligibleChannel,
  adsConversionService,
  type CapiDeliverySummary,
  isAdsEligibleChannel,
} from "../ads-conversion"
import {
  buildFacebookAdsContext,
  getCachedAdInsights,
  getCachedDailyAdInsights,
} from "../integration-facebook-ads/graph-reads"
import { filterAdAccountsByIds } from "../integration-facebook-ads/selection"
import { logger } from "../logger"
import { buildMessagingAdsContext } from "../messaging-ads-connection/context"
import {
  type AdAccountSource,
  type ChannelAdAccount,
  resolveChannelAdAccountSources,
} from "./channel-ad-accounts"
import { parseAnalyticsDateRange } from "./date-range"
import {
  type AdsAnalyticsData,
  type InsightSpendRow,
  mergeAdsAnalytics,
} from "./merge"

export type AdsAnalyticsScope = {
  workspaceId: string
  /** Inclusive calendar-day keys, `YYYY-MM-DD`; clamped to MAX_ADS_ANALYTICS_RANGE_DAYS. */
  from: string
  to: string
  /** Viewer IANA timezone; omitted/invalid resolves to "UTC". */
  tz?: string
  /** `act_<digits>`; anything else is ignored (no ad-account filter). */
  adAccountId?: string
  // `channel`/`integrationMessengerId`/`integrationInstagramId` widen this
  // beyond WhatsApp (Phase 6 analytics UI) — additive next to
  // `integrationWhatsappId`, omitted keeps whatsapp-only behavior unchanged
  // (mirrors `GetCtwaFunnelInput`/`ctwaFunnelShape` in the ads-conversion
  // service).
  channel?: AdsConversionChannel
  integrationWhatsappId?: string
  integrationMessengerId?: string
  integrationInstagramId?: string
  // "All channels" (Ads Analytics default) — the caller resolves `channel ===
  // "all"` into this SEPARATE flag before ever building this scope, so
  // `channel`/every integration id above are always undefined when this is
  // true.
  allChannels?: boolean
}

const AD_ACCOUNT_ID_RE = /^act_\d+$/

/**
 * Channel/integration scoping fields shared by every `adsConversionService`
 * call in this file (`getCtwaFunnel`, `getCapiDeliverySummary`,
 * `getCtwaFunnelTimeseries`) — lifted straight off `scope` unchanged.
 */
function channelScope(scope: AdsAnalyticsScope) {
  return {
    integrationWhatsappId: scope.integrationWhatsappId,
    channel: scope.channel,
    integrationMessengerId: scope.integrationMessengerId,
    integrationInstagramId: scope.integrationInstagramId,
    allChannels: scope.allChannels,
  }
}

/**
 * The one channel-integration id selected on `scope`, whichever channel's FK
 * column it landed in — same "pick whichever of the three is set" shape
 * `channelScope` already threads to the funnel side; this is its spend-side
 * counterpart (Codex HIGH-3) for `resolveSelectedAdAccounts`'s
 * `integrationId` narrowing.
 */
function selectedIntegrationId(scope: AdsAnalyticsScope): string | undefined {
  return (
    scope.integrationWhatsappId ??
    scope.integrationMessengerId ??
    scope.integrationInstagramId
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
 * when the scope has no resolvable ads-eligible channel or the account list
 * fails to load — callers should treat that as "no insights, no filter".
 *
 * A workspace connected ONLY through a box (no separate Facebook Ads
 * integration) yields spend too — see the `adsCampaign.box.emptyDashboardNote`
 * copy shown as the dashboard hint on the Click to Message Ads tool page.
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
 * `buildFacebookAdsContext` and box `buildMessagingAdsContext` both produce
 * it) — never resolved here eagerly, only handed through.
 */
function buildContextResolverBySource(input: {
  workspaceId: string
  channel: AdsEligibleChannel
}) {
  const bySourceKey = new Map<
    string,
    () => ReturnType<typeof buildFacebookAdsContext>
  >()

  return (source: AdAccountSource | undefined) => {
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
        ? buildFacebookAdsContext(input.workspaceId)
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

class AdsAnalyticsService {
  async getOverview(scope: AdsAnalyticsScope): Promise<AdsAnalyticsData> {
    const { since, until, from, to } = parseAnalyticsDateRange(scope)
    const adAccountId = AD_ACCOUNT_ID_RE.test(scope.adAccountId ?? "")
      ? scope.adAccountId
      : undefined

    const [funnel, insightsResult] = await Promise.all([
      adsConversionService.getCtwaFunnel({
        workspaceId: scope.workspaceId,
        since,
        until,
        ...channelScope(scope),
      }),
      // `from`/`to` here are still raw date-KEYS (not the resolved UTC
      // instants) — Meta Graph API's `insights` endpoint interprets them in
      // the AD ACCOUNT's own reporting timezone, not the viewer's. This is
      // unavoidable (no per-request override) and deliberately unchanged by
      // the viewer-timezone migration.
      listInsightsForConnectedAdAccounts({
        workspaceId: scope.workspaceId,
        channel: scope.channel,
        integrationId: selectedIntegrationId(scope),
        since: from,
        until: to,
        adAccountId,
      }),
    ])

    return mergeAdsAnalytics({
      funnel,
      insights: insightsResult.insights,
      integrationFilterActive: Boolean(
        scope.integrationWhatsappId ||
          scope.integrationMessengerId ||
          scope.integrationInstagramId,
      ),
      adAccountFilterActive: insightsResult.adAccountFilterApplied,
    })
  }

  getCapiDelivery(scope: AdsAnalyticsScope): Promise<CapiDeliverySummary> {
    const { since, until } = parseAnalyticsDateRange(scope)

    return adsConversionService.getCapiDeliverySummary({
      workspaceId: scope.workspaceId,
      since,
      until,
      ...channelScope(scope),
    })
  }

  async getTimeseries(
    scope: AdsAnalyticsScope,
  ): Promise<AdsAnalyticsTimeseriesRow[]> {
    const { since, until, from, to, timezone } = parseAnalyticsDateRange(scope)
    const adAccountId = AD_ACCOUNT_ID_RE.test(scope.adAccountId ?? "")
      ? scope.adAccountId
      : undefined

    const [funnelRows, dailyInsightsResult] = await Promise.all([
      adsConversionService.getCtwaFunnelTimeseries({
        workspaceId: scope.workspaceId,
        since,
        until,
        timezone,
        ...channelScope(scope),
      }),
      // `from`/`to` date-KEYS, interpreted by Meta in the ad account's own
      // reporting timezone — see the comment in `getOverview` above.
      listDailyInsightsForConnectedAdAccounts({
        workspaceId: scope.workspaceId,
        channel: scope.channel,
        integrationId: selectedIntegrationId(scope),
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
}

export const adsAnalyticsService = new AdsAnalyticsService()
