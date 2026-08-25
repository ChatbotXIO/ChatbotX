import {
  type AdsEligibleChannelType,
  adsEligibleChannelTypes,
} from "@chatbotx.io/utils/channel"
import {
  createSearchParamsCache,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server"
import { accountSearchParam } from "./account"

// The channel filter narrows the funnel to one ads-eligible channel at a
// time — derived from the canonical `adsEligibleChannelTypes` list
// ("facebook" is a dead AdsConversionChannel value and is not in it) — PLUS
// the analytics-UI-only "all" sentinel (All channels default). "all" is
// deliberately NOT part of `adsEligibleChannelTypes`/`AdsConversionChannel`:
// it must never reach the DB enum, `adsEligibleChannelTypes`-gated writers,
// the worker's `listRetargetContactsInput`, or contact-filter — every caller
// on those paths resolves `channel === "all"` into a separate `allChannels`
// boolean BEFORE the value can leak there (see `page.tsx`'s
// `resolveChannelIntegrations`/`perChannelIntegrationIds` and
// `ads-analytics-view.tsx`'s per-channel maps).
export const adsAnalyticsChannelValues = [
  ...adsEligibleChannelTypes.options,
  "all",
] as const
export type AdsAnalyticsChannel = AdsEligibleChannelType | "all"

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
  // `channelAccount` narrows to one messenger/instagram integration for the
  // selected `channel` — mirrors `account`'s role for whatsapp, but omitted
  // (default "") aggregates across every connected integration for that
  // channel instead of forcing a single selection.
  // Default = "all" (decision 8): the dashboard opens aggregated across
  // every ads-eligible channel. `DEFAULT_ADS_CONVERSION_CHANNEL` (the
  // DB/query "omitted = whatsapp" default) is untouched — this only changes
  // the URL default. Legacy deep links with `?channel=whatsapp` still pin
  // one channel.
  channel: parseAsStringLiteral(adsAnalyticsChannelValues).withDefault("all"),
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
