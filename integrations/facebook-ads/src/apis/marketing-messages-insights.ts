import { z } from "zod"
import { ADS_PAGE_LIMIT, DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { fetchAllPages } from "./ad-accounts"

/**
 * Marketing Messages insights for the Statistics tab
 * (developers.facebook.com/documentation/business-messaging/messenger-platform/marketing-messages-on-messenger/measure-performance).
 *
 * The id we store as a campaign's `campaignId` is the **ad** id that
 * `POST act_<id>/message_campaign` returns (see `message-campaigns.ts`), so
 * rows are read at `level=ad` filtered by `ad.id`. The footer aggregate is the
 * same filter at `level=account`: Meta returns ONE row computed over exactly
 * those ads, so its rates and cost-per figures are Meta's own weighted values.
 *
 * Every metric is `null` when Meta omits it (no delivery, or a region Meta
 * excludes such as Europe/Japan) — never 0, since "no data" and "0" read
 * differently in the table. Money is in major units, unlike the minor-unit
 * budgets sent on create.
 */

/**
 * With any `filtering` present Meta silently drops ads that are not ACTIVE
 * (verified live: a paused/archived ad returns `data: []`), so every filtered
 * read must widen the status filter or a stopped campaign would lose its
 * history.
 */
const ALL_AD_EFFECTIVE_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "DELETED",
  "PENDING_REVIEW",
  "DISAPPROVED",
  "PREAPPROVED",
  "PENDING_BILLING_INFO",
  "CAMPAIGN_PAUSED",
  "ARCHIVED",
  "ADSET_PAUSED",
  "IN_PROCESS",
  "WITH_ISSUES",
]

const METRIC_FIELDS = {
  delivered: "marketing_messages_delivered",
  readRate: "marketing_messages_read_rate",
  linkClicks: "marketing_messages_link_btn_click",
  linkClickRate: "marketing_messages_link_btn_click_rate",
  costPerClick: "marketing_messages_cost_per_link_btn_click",
  costPerDelivery: "marketing_messages_cost_per_delivered",
  spend: "marketing_messages_spend",
} as const

export type MarketingMessagesInsightMetrics = {
  [K in keyof typeof METRIC_FIELDS]: number | null
}

export type MarketingMessagesAdInsight = MarketingMessagesInsightMetrics & {
  adId: string
  currency: string | null
}

export type MarketingMessagesAggregateInsight =
  MarketingMessagesInsightMetrics & { currency: string | null }

export type GetMarketingMessagesInsightsInput = {
  accessToken: string
  /** `act_<id>`. */
  adAccountId: string
  /** The stored `campaignId`s — Meta ad ids (see module comment). */
  adIds: string[]
  /** `YYYY-MM-DD`, in the ad account's timezone. */
  since: string
  until: string
  version?: string
}

// Unknown on purpose: an unexpected shape for one metric (Meta's MM field
// shapes were not observed live) must blank that cell, not the whole table.
const graphMetricValueSchema = z.unknown().optional()

const graphRowSchema = z.object({
  ad_id: z.string().optional(),
  account_currency: z.string().optional(),
  marketing_messages_delivered: graphMetricValueSchema,
  marketing_messages_read_rate: graphMetricValueSchema,
  marketing_messages_link_btn_click: graphMetricValueSchema,
  marketing_messages_link_btn_click_rate: graphMetricValueSchema,
  marketing_messages_cost_per_link_btn_click: graphMetricValueSchema,
  marketing_messages_cost_per_delivered: graphMetricValueSchema,
  marketing_messages_spend: graphMetricValueSchema,
})

type GraphRow = z.infer<typeof graphRowSchema>

function toNullableNumber(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null
  }
  if (value === "") {
    return null
  }
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toMetrics(row: GraphRow): MarketingMessagesInsightMetrics {
  return {
    delivered: toNullableNumber(row.marketing_messages_delivered),
    readRate: toNullableNumber(row.marketing_messages_read_rate),
    linkClicks: toNullableNumber(row.marketing_messages_link_btn_click),
    linkClickRate: toNullableNumber(row.marketing_messages_link_btn_click_rate),
    costPerClick: toNullableNumber(
      row.marketing_messages_cost_per_link_btn_click,
    ),
    costPerDelivery: toNullableNumber(
      row.marketing_messages_cost_per_delivered,
    ),
    spend: toNullableNumber(row.marketing_messages_spend),
  }
}

function fetchInsightRows(
  input: GetMarketingMessagesInsightsInput,
  level: "ad" | "account",
): Promise<GraphRow[]> {
  const { version = DEFAULT_API_VERSION } = input
  const endpoint = `${version}/${input.adAccountId}/insights`
  const fields = [
    ...(level === "ad" ? ["ad_id"] : []),
    "account_currency",
    ...Object.values(METRIC_FIELDS),
  ]

  return rescue(endpoint, async () => {
    const rows = await fetchAllPages<unknown>(endpoint, {
      level,
      fields: fields.join(","),
      time_range: JSON.stringify({ since: input.since, until: input.until }),
      filtering: JSON.stringify([
        { field: "ad.id", operator: "IN", value: input.adIds },
        {
          field: "ad.effective_status",
          operator: "IN",
          value: ALL_AD_EFFECTIVE_STATUSES,
        },
      ]),
      limit: String(ADS_PAGE_LIMIT),
      access_token: input.accessToken,
    })
    return z.array(graphRowSchema).parse(rows)
  })
}

/** ONE Graph call for every requested ad (never N+1); `[]` for no ads. */
export async function getMarketingMessagesAdInsights(
  input: GetMarketingMessagesInsightsInput,
): Promise<MarketingMessagesAdInsight[]> {
  if (input.adIds.length === 0) {
    return []
  }
  const rows = await fetchInsightRows(input, "ad")
  return rows.flatMap((row) =>
    row.ad_id
      ? [
          {
            adId: row.ad_id,
            currency: row.account_currency ?? null,
            ...toMetrics(row),
          },
        ]
      : [],
  )
}

/** Meta's aggregate over exactly `adIds`; `null` when none of them has data. */
export async function getMarketingMessagesAggregateInsights(
  input: GetMarketingMessagesInsightsInput,
): Promise<MarketingMessagesAggregateInsight | null> {
  if (input.adIds.length === 0) {
    return null
  }
  const [row] = await fetchInsightRows(input, "account")
  return row
    ? { currency: row.account_currency ?? null, ...toMetrics(row) }
    : null
}
