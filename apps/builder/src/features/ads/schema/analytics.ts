import { getDefaultAdsAnalyticsRange } from "@chatbotx.io/business/ads-analytics/date-range"
import { createSearchParamsCache, parseAsString } from "nuqs/server"
import { accountSearchParam } from "./account"

export {
  getDefaultAdsAnalyticsRange,
  MAX_ADS_ANALYTICS_RANGE_DAYS,
  parseAnalyticsDateRange,
  toDateKey,
} from "@chatbotx.io/business/ads-analytics/date-range"

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
  // Carries the viewer's IANA timezone name (e.g. `Intl.DateTimeFormat().
  // resolvedOptions().timeZone`, threaded from the client — a server
  // component can't read the browser's timezone). Default "" resolves to
  // "UTC" in `resolveTimezone`/`parseAnalyticsDateRange`, so a request that
  // never carried `tz` (an old bookmark, an external/legacy caller) keeps
  // the pre-migration UTC-anchored behavior byte-identical.
  tz: parseAsString.withDefault(""),
})

export type AdsAnalyticsSearchParams = Awaited<
  ReturnType<typeof adsAnalyticsSearchParamsCache.parse>
>
