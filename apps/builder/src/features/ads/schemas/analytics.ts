import { createSearchParamsCache, parseAsString } from "nuqs/server"
import { accountSearchParam } from "./account"

const toDateKey = (date: Date): string => date.toISOString().slice(0, 10)
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

// HIGH-5: without a cap, a manipulated from/to URL param can force a huge
// Facebook Graph API + CAPI-funnel date-range scan/loop (every day in the
// range gets its own row/aggregation). 366 covers a full leap year for
// legitimate year-over-year comparisons.
export const MAX_ADS_ANALYTICS_RANGE_DAYS = 366
const MS_PER_DAY = 24 * 60 * 60 * 1000

export function getDefaultAdsAnalyticsRange(now = new Date()) {
  const until = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
  const since = new Date(until)
  since.setUTCDate(since.getUTCDate() - 29)

  return {
    from: toDateKey(since),
    to: toDateKey(until),
  }
}

const defaultRange = getDefaultAdsAnalyticsRange()

export const adsAnalyticsSearchParamsCache = createSearchParamsCache({
  account: accountSearchParam,
  adAccount: parseAsString.withDefault(""),
  from: parseAsString.withDefault(defaultRange.from),
  to: parseAsString.withDefault(defaultRange.to),
})

export type AdsAnalyticsSearchParams = Awaited<
  ReturnType<typeof adsAnalyticsSearchParamsCache.parse>
>

export function parseAnalyticsDateRange(input: { from: string; to: string }): {
  since: Date
  until: Date
  from: string
  to: string
} {
  const fallback = getDefaultAdsAnalyticsRange()
  const from = DATE_KEY_RE.test(input.from) ? input.from : fallback.from
  const to = DATE_KEY_RE.test(input.to) ? input.to : fallback.to
  const since = new Date(`${from}T00:00:00.000Z`)
  const until = new Date(`${to}T23:59:59.999Z`)
  const rangeDays = (until.getTime() - since.getTime()) / MS_PER_DAY

  if (
    since.getTime() <= until.getTime() &&
    rangeDays <= MAX_ADS_ANALYTICS_RANGE_DAYS
  ) {
    return { since, until, from, to }
  }

  return {
    since: new Date(`${fallback.from}T00:00:00.000Z`),
    until: new Date(`${fallback.to}T23:59:59.999Z`),
    from: fallback.from,
    to: fallback.to,
  }
}
