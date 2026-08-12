export type FunnelTotals = {
  conversations: number
  leads: number
  purchases: number
  revenue: number
}

export type FunnelAdRow = FunnelTotals & {
  adId: string | null
  adName?: string | null
}

export type InsightSpendRow = {
  adId: string
  adName?: string | null
  spend?: number | string | null
  impressions?: number | string | null
  clicks?: number | string | null
}

export type AdsAnalyticsRow = FunnelAdRow & {
  spend: number | null
  costPerLead: number | null
  costPerPurchase: number | null
  roas: number | null
  impressions: number | null
  clicks: number | null
  cpc: number | null
  ctr: number | null
  cpm: number | null
  costPerConversation: number | null
}

export type AdsAnalyticsData = {
  totals: FunnelTotals & {
    spend: number
    costPerLead: number | null
    costPerPurchase: number | null
    roas: number | null
    impressions: number
    clicks: number
    cpc: number | null
    ctr: number | null
    cpm: number | null
    costPerConversation: number | null
  }
  perAd: AdsAnalyticsRow[]
}

function parseNumeric(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") {
    return null
  }
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function divideCost(spend: number | null, count: number): number | null {
  if (spend === null || count <= 0) {
    return null
  }
  return spend / count
}

function divideRoas(revenue: number, spend: number | null): number | null {
  return spend !== null && spend > 0 ? revenue / spend : null
}

function divideRate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null
}

const CPM_MULTIPLIER = 1000

function divideCpm(spend: number | null, impressions: number): number | null {
  const rate = divideCost(spend, impressions)
  return rate === null ? null : rate * CPM_MULTIPLIER
}

const adKey = (adId: string | null) => adId ?? "__unattributed__"

const emptyAdsAnalyticsRow = {
  conversations: 0,
  leads: 0,
  purchases: 0,
  revenue: 0,
  spend: null,
  costPerLead: null,
  costPerPurchase: null,
  roas: null,
  impressions: null,
  clicks: null,
  cpc: null,
  ctr: null,
  cpm: null,
  costPerConversation: null,
} satisfies Omit<AdsAnalyticsRow, "adId" | "adName">

export function mergeAdsAnalytics(input: {
  funnel: { totals: FunnelTotals; perAd: FunnelAdRow[] }
  insights: InsightSpendRow[]
  integrationFilterActive?: boolean
  adAccountFilterActive?: boolean
}): AdsAnalyticsData {
  const rows = new Map<string, AdsAnalyticsRow>()

  for (const row of input.funnel.perAd) {
    rows.set(adKey(row.adId), {
      ...emptyAdsAnalyticsRow,
      adId: row.adId,
      adName: row.adName ?? null,
      conversations: row.conversations,
      leads: row.leads,
      purchases: row.purchases,
      revenue: row.revenue,
    })
  }

  for (const insight of input.insights) {
    const spend = parseNumeric(insight.spend)
    const impressions = parseNumeric(insight.impressions)
    const clicks = parseNumeric(insight.clicks)
    const key = adKey(insight.adId)
    const existing =
      rows.get(key) ??
      ({
        ...emptyAdsAnalyticsRow,
        adId: insight.adId,
      } satisfies AdsAnalyticsRow)

    rows.set(key, {
      ...existing,
      adName: insight.adName ?? existing.adName ?? null,
      spend: (existing.spend ?? 0) + (spend ?? 0),
      impressions: (existing.impressions ?? 0) + (impressions ?? 0),
      clicks: (existing.clicks ?? 0) + (clicks ?? 0),
    })
  }

  const perAd = [...rows.values()]
    .filter(
      (row) =>
        (!input.integrationFilterActive ||
          row.conversations > 0 ||
          row.leads > 0 ||
          row.purchases > 0) &&
        (!input.adAccountFilterActive || row.spend !== null),
    )
    .map((row) => ({
      ...row,
      costPerLead: divideCost(row.spend, row.leads),
      costPerPurchase: divideCost(row.spend, row.purchases),
      roas: divideRoas(row.revenue, row.spend),
      cpc: divideCost(row.spend, row.clicks ?? 0),
      ctr: divideRate(row.clicks ?? 0, row.impressions ?? 0),
      cpm: divideCpm(row.spend, row.impressions ?? 0),
      costPerConversation: divideCost(row.spend, row.conversations),
    }))

  // Totals are computed from the SURVIVOR perAd rows (after the filters
  // above), never from raw funnel/insights sums — otherwise a filtered-out
  // row's spend/impressions/clicks would still leak into the totals.
  const spend = perAd.reduce((total, row) => total + (row.spend ?? 0), 0)
  const impressions = perAd.reduce(
    (total, row) => total + (row.impressions ?? 0),
    0,
  )
  const clicks = perAd.reduce((total, row) => total + (row.clicks ?? 0), 0)
  const totals = input.adAccountFilterActive
    ? perAd.reduce<FunnelTotals>(
        (acc, row) => ({
          conversations: acc.conversations + row.conversations,
          leads: acc.leads + row.leads,
          purchases: acc.purchases + row.purchases,
          revenue: acc.revenue + row.revenue,
        }),
        { conversations: 0, leads: 0, purchases: 0, revenue: 0 },
      )
    : input.funnel.totals

  return {
    totals: {
      ...totals,
      spend,
      costPerLead: divideCost(spend, totals.leads),
      costPerPurchase: divideCost(spend, totals.purchases),
      roas: divideRoas(totals.revenue, spend),
      impressions,
      clicks,
      cpc: divideCost(spend, clicks),
      ctr: divideRate(clicks, impressions),
      cpm: divideCpm(spend, impressions),
      costPerConversation: divideCost(spend, totals.conversations),
    },
    perAd: perAd.sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0)),
  }
}
