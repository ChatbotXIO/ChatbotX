import { z } from "zod"
import {
  ADS_PAGE_LIMIT,
  DEFAULT_API_VERSION,
  MAX_GRAPH_PAGES,
} from "../constants"
import { rescue } from "../exception"
import { facebookAdsGraphClient } from "../lib/http-client"
import { facebookAdsLogger } from "../logger"
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
