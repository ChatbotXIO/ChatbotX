import { createSearchParamsCache, parseAsString } from "nuqs/server"
import { accountSearchParam } from "./account"

// Exported so the shared `DateRangePresetFilter` bridge (Ads is URL-driven,
// not store-driven) formats its `?from=&to=` params identically to this
// module's own defaults/parsing — a single source for the UTC date-key format.
export const toDateKey = (date: Date): string => date.toISOString().slice(0, 10)
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

// HIGH-5: without a cap, a manipulated from/to URL param can force a huge
// Facebook Graph API + CAPI-funnel date-range scan/loop (every day in the
// range gets its own row/aggregation). 366 covers a full leap year for
// legitimate year-over-year comparisons.
export const MAX_ADS_ANALYTICS_RANGE_DAYS = 366
const MS_PER_DAY = 24 * 60 * 60 * 1000

// Matches the Contacts/Conversations dashboards' "Last 7 days" preset default
// (see `DateRangePresetFilter`'s own `defaultPreset = "last7"`) so the Ads
// dashboard's first load lines up with the preset the filter shows as active.
const DEFAULT_RANGE_DAYS_BACK = 6

export function getDefaultAdsAnalyticsRange(now = new Date()) {
  const until = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
  const since = new Date(until)
  since.setUTCDate(since.getUTCDate() - DEFAULT_RANGE_DAYS_BACK)

  return {
    from: toDateKey(since),
    to: toDateKey(until),
  }
}

const defaultRange = getDefaultAdsAnalyticsRange()

export const adsAnalyticsSearchParamsCache = createSearchParamsCache({
  account: accountSearchParam,
  // `channelAccount` narrows to one messenger/instagram integration for the
  // selected channel — mirrors `account`'s role for whatsapp, but omitted
  // (default "") aggregates across every connected integration for that
  // channel instead of forcing a single selection. The channel itself is the
  // route segment (`/dashboard/ads/<channel>`), never a search param.
  channelAccount: parseAsString.withDefault(""),
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

  // Inverted order (from after to) is unsalvageable — fall back to the default.
  if (since.getTime() > until.getTime()) {
    return {
      since: new Date(`${fallback.from}T00:00:00.000Z`),
      until: new Date(`${fallback.to}T23:59:59.999Z`),
      from: fallback.from,
      to: fallback.to,
    }
  }

  const rangeDays = (until.getTime() - since.getTime()) / MS_PER_DAY
  if (rangeDays <= MAX_ADS_ANALYTICS_RANGE_DAYS) {
    return { since, until, from, to }
  }

  // Over the cap — clamp the START to the most recent allowed window ending at
  // `to`, rather than collapsing to the 7-day default. The "Lifetime" preset on
  // a workspace older than the cap (and any manipulated multi-year URL range)
  // lands here: the scan stays bounded exactly as the HIGH-5 guard intends, but
  // the user sees the most recent year of data under the label they picked
  // instead of a silent, unexplained 7-day window. The cap counts inclusive
  // calendar days, so the earliest allowed `from` is `to` minus (MAX - 1) days.
  const clampedSince = new Date(`${to}T00:00:00.000Z`)
  clampedSince.setUTCDate(
    clampedSince.getUTCDate() - (MAX_ADS_ANALYTICS_RANGE_DAYS - 1),
  )
  const clampedFrom = clampedSince.toISOString().slice(0, 10)

  return { since: clampedSince, until, from: clampedFrom, to }
}
