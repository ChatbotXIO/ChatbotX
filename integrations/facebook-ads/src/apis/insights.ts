import { z } from "zod"
import {
  ADS_PAGE_LIMIT,
  DEFAULT_API_VERSION,
  MAX_GRAPH_PAGES,
} from "../constants"
import { rescue } from "../exception"
import { facebookAdsGraphClient } from "../lib/http-client"
import { facebookAdsLogger } from "../logger"
import type { MessagingAdChannel } from "../messaging-ads/constants"
import { MESSAGING_CONVERSATION_STARTED_ACTION_TYPE_BY_CHANNEL } from "../messaging-ads/constants"
import type { MessagingAdInsight } from "../messaging-ads/types"
import { type FacebookAdInsight, facebookAdInsightSchema } from "../schemas"

type GraphPage<T> = {
  data?: T[]
  paging?: { cursors?: { after?: string }; next?: string }
}

// `paging.next` is an absolute URL while the ky client is baseUrl-relative, so
// follow `paging.cursors.after` instead (mirrors ad-accounts.ts).
async function fetchAllPages<T>(
  endpoint: string,
  searchParams: Record<string, string>,
): Promise<T[]> {
  const results: T[] = []
  let after: string | undefined
  let lastPaging: GraphPage<T>["paging"]
  let reachedPageLimit = true
  for (let page = 0; page < MAX_GRAPH_PAGES; page++) {
    const res = await facebookAdsGraphClient.get<GraphPage<T>>(endpoint, {
      searchParams: after ? { ...searchParams, after } : searchParams,
    })
    results.push(...(res.data ?? []))
    lastPaging = res.paging
    after = res.paging?.next ? res.paging.cursors?.after : undefined
    if (!after) {
      reachedPageLimit = false
      break
    }
  }
  if (reachedPageLimit && lastPaging?.next) {
    facebookAdsLogger.warn(
      { endpoint, maxPages: MAX_GRAPH_PAGES },
      "Facebook Ads Graph pagination truncated: paging.next still present after MAX_GRAPH_PAGES",
    )
  }
  return results
}

const graphAdInsightRowSchema = z.object({
  ad_id: z.string().trim().min(1),
  ad_name: z.string().optional(),
  spend: z.union([z.string(), z.number()]).optional(),
  impressions: z.union([z.string(), z.number()]).optional(),
  clicks: z.union([z.string(), z.number()]).optional(),
  date_start: z.string().optional(),
})

export type GetAdInsightsInput = {
  accessToken: string
  adAccountId: string
  since: string
  until: string
  version?: string
  /** When set to 1, requests daily-broken-down rows (adds `date_start`). */
  timeIncrement?: 1
}

export function getAdInsights({
  accessToken,
  adAccountId,
  since,
  until,
  version = DEFAULT_API_VERSION,
  timeIncrement,
}: GetAdInsightsInput): Promise<FacebookAdInsight[]> {
  const endpoint = `${version}/${adAccountId}/insights`
  const fields = timeIncrement
    ? "ad_id,ad_name,spend,impressions,clicks,date_start"
    : "ad_id,ad_name,spend,impressions,clicks"

  return rescue(endpoint, async () => {
    const rows = await fetchAllPages<unknown>(endpoint, {
      level: "ad",
      fields,
      time_range: JSON.stringify({ since, until }),
      limit: String(ADS_PAGE_LIMIT),
      access_token: accessToken,
      ...(timeIncrement ? { time_increment: String(timeIncrement) } : {}),
    })

    return z
      .array(graphAdInsightRowSchema.pipe(facebookAdInsightSchema))
      .parse(rows)
  })
}

// ---------------------------------------------------------------------------
// Messaging-ads Insights (CTM/CTID/CTWA box "Ads Insights" panel) — a
// SEPARATE read from `getAdInsights` above: different field set
// (actions/cost_per_action_type instead of ad_name), `date_preset` instead of
// a `since`/`until` range, and scoped by an explicit `ad.id IN [...]` filter
// (never `level=ad` over the whole account) so the box only ever sees the ads
// IT created. Always ONE Graph call for every requested ad id — never one
// call per ad.
// ---------------------------------------------------------------------------

const graphActionValueSchema = z.union([z.string(), z.number()])

const graphInsightActionSchema = z.object({
  action_type: z.string(),
  value: graphActionValueSchema,
})

const graphMessagingAdInsightRowSchema = z.object({
  ad_id: z.string().trim().min(1),
  account_currency: z.string().optional(),
  impressions: z.union([z.string(), z.number()]).optional(),
  reach: z.union([z.string(), z.number()]).optional(),
  spend: z.union([z.string(), z.number()]).optional(),
  clicks: z.union([z.string(), z.number()]).optional(),
  actions: z.array(graphInsightActionSchema).optional(),
  cost_per_action_type: z.array(graphInsightActionSchema).optional(),
})

function toFiniteNumber(value: string | number | undefined): number {
  if (value === undefined || value === "") {
    return 0
  }
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Finds `value` for one `action_type` inside an `actions[]`/`cost_per_action_type[]` array — `null` when Meta reports no matching entry (never coerced to 0, since "no entry" and "entry with value 0" mean different things for a cost figure). */
function findActionValue(
  actions: { action_type: string; value: string | number }[] | undefined,
  actionType: string,
): number | null {
  const match = actions?.find((action) => action.action_type === actionType)
  return match === undefined ? null : toFiniteNumber(match.value)
}

/** Meta `date_preset` values this integration exposes a selector for — validated here so an unrecognized string never reaches Graph silently mistyped. */
export const MESSAGING_ADS_INSIGHTS_DATE_PRESETS = [
  "maximum",
  "last_30d",
  "last_7d",
] as const
export type MessagingAdsInsightsDatePreset =
  (typeof MESSAGING_ADS_INSIGHTS_DATE_PRESETS)[number]

const DEFAULT_INSIGHTS_DATE_PRESET: MessagingAdsInsightsDatePreset = "maximum"

export type GetMessagingAdsInsightsByAdIdsInput = {
  accessToken: string
  adAccountId: string
  adIds: string[]
  channel: MessagingAdChannel
  /**
   * Meta `date_preset` — defaults to `"maximum"` (all-time, matches the box
   * default). Typed as plain `string` here (not
   * `MessagingAdsInsightsDatePreset`) because this input flows in from the
   * `Handler` props (`GetMessagingAdsInsightsProps` in `../schemas.ts`, which
   * this module already imports FROM — `../schemas` -> `./apis/insights`
   * would be circular); the oRPC request schema (`apps/builder`) is the
   * actual enforcement point for the allowed-value enum, reusing
   * `MESSAGING_ADS_INSIGHTS_DATE_PRESETS` below.
   */
  datePreset?: string
  version?: string
}

const MESSAGING_ADS_INSIGHTS_FIELDS =
  "ad_id,account_currency,impressions,reach,spend,clicks,actions,cost_per_action_type"

/**
 * ONE Graph call for every requested ad's insights (`level=ad`, `ad.id IN
 * [...]` filtering) — never N+1 per ad. Returns `[]` without calling Graph
 * when `adIds` is empty (e.g. a box with no ads created on Meta yet).
 */
export function getMessagingAdsInsightsByAdIds({
  accessToken,
  adAccountId,
  adIds,
  channel,
  datePreset = DEFAULT_INSIGHTS_DATE_PRESET,
  version = DEFAULT_API_VERSION,
}: GetMessagingAdsInsightsByAdIdsInput): Promise<MessagingAdInsight[]> {
  if (adIds.length === 0) {
    return Promise.resolve([])
  }
  const endpoint = `${version}/${adAccountId}/insights`
  const actionType =
    MESSAGING_CONVERSATION_STARTED_ACTION_TYPE_BY_CHANNEL[channel]

  return rescue(endpoint, async () => {
    const rows = await fetchAllPages<unknown>(endpoint, {
      level: "ad",
      fields: MESSAGING_ADS_INSIGHTS_FIELDS,
      date_preset: datePreset,
      filtering: JSON.stringify([
        { field: "ad.id", operator: "IN", value: adIds },
      ]),
      limit: String(ADS_PAGE_LIMIT),
      access_token: accessToken,
    })

    const parsedRows = z.array(graphMessagingAdInsightRowSchema).parse(rows)
    return parsedRows.map(
      (row): MessagingAdInsight => ({
        adId: row.ad_id,
        currency: row.account_currency ?? null,
        impressions: toFiniteNumber(row.impressions),
        reach: toFiniteNumber(row.reach),
        spend: toFiniteNumber(row.spend),
        clicks: toFiniteNumber(row.clicks),
        conversations: findActionValue(row.actions, actionType) ?? 0,
        costPerConversation: findActionValue(
          row.cost_per_action_type,
          actionType,
        ),
      }),
    )
  })
}
