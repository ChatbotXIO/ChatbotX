import { fromZonedTime } from "date-fns-tz"
import { createSearchParamsCache, parseAsString } from "nuqs/server"
import { accountSearchParam } from "./account"

// Exported so the shared `DateRangePresetFilter` bridge (Ads is URL-driven,
// not store-driven) formats its `?from=&to=` params identically to this
// module's own defaults/parsing — a single source for the UTC date-key format.
export const toDateKey = (date: Date): string => date.toISOString().slice(0, 10)
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * A `from`/`to` URL param is usable only if it is a real calendar day, not just
 * the right shape: the regex alone accepts `2026-13-01` (parses to an Invalid
 * Date that would later throw in the clamp branch's `toISOString()`) and
 * `2026-02-30` (silently normalized to Mar 2, so the returned key would no
 * longer match the window). Require a canonical round-trip so any such value
 * falls back to the default instead — keeping the query bounds and the exported
 * date keys reliable.
 */
function isValidDateKey(key: string): boolean {
  if (!DATE_KEY_RE.test(key)) {
    return false
  }
  const parsed = new Date(`${key}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && toDateKey(parsed) === key
}

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

const MAX_TIMEZONE_NAME_LENGTH = 64

/**
 * Resolves an untrusted `tz` value (a URL search param) to a timezone name
 * safe to hand to `Intl`/`date-fns-tz`. `Intl.DateTimeFormat` is the
 * authority on "is this a real IANA name" — a length cap runs first only to
 * avoid constructing a `DateTimeFormat` from a pathologically long string,
 * never as a substitute for the validity check. Falls back to `"UTC"`,
 * matching the pipeline's pre-migration behavior for any caller that omits
 * or mangles the param.
 */
export function resolveTimezone(tz: string): string {
  if (tz.length > MAX_TIMEZONE_NAME_LENGTH) {
    return "UTC"
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz })
    return tz
  } catch {
    return "UTC"
  }
}

/** Local midnight of `dateKey` in `timezone`, as the exact UTC instant. */
function zonedDayStart(dateKey: string, timezone: string): Date {
  return fromZonedTime(`${dateKey}T00:00:00.000`, timezone)
}

/** The last local millisecond of `dateKey` in `timezone`, as a UTC instant. */
function zonedDayEnd(dateKey: string, timezone: string): Date {
  return fromZonedTime(`${dateKey}T23:59:59.999`, timezone)
}

export function parseAnalyticsDateRange(input: {
  from: string
  to: string
  tz?: string
}): {
  since: Date
  until: Date
  from: string
  to: string
  timezone: string
} {
  const timezone = resolveTimezone(input.tz ?? "")
  const fallback = getDefaultAdsAnalyticsRange()
  const from = isValidDateKey(input.from) ? input.from : fallback.from
  const to = isValidDateKey(input.to) ? input.to : fallback.to
  const since = zonedDayStart(from, timezone)
  const until = zonedDayEnd(to, timezone)

  // Inverted order (from after to) is unsalvageable — fall back to the default.
  if (since.getTime() > until.getTime()) {
    return {
      since: zonedDayStart(fallback.from, timezone),
      until: zonedDayEnd(fallback.to, timezone),
      from: fallback.from,
      to: fallback.to,
      timezone,
    }
  }

  // Cap by calendar-day KEYS (UTC-anchored key arithmetic), not elapsed
  // instant milliseconds — a DST/dateline-skipping timezone (e.g.
  // Pacific/Apia's 2011 skipped day) compresses elapsed time and would let a
  // 367-key range slip under an instant-based cap. The cap counts INCLUSIVE
  // calendar days: key-diff + 1 (from == to is a 1-day range).
  const inclusiveRangeDays =
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
      MS_PER_DAY +
    1
  if (inclusiveRangeDays <= MAX_ADS_ANALYTICS_RANGE_DAYS) {
    return { since, until, from, to, timezone }
  }

  // Over the cap — clamp the START to the most recent allowed window ending at
  // `to`, rather than collapsing to the 7-day default. The "Lifetime" preset on
  // a workspace older than the cap (and any manipulated multi-year URL range)
  // lands here: the scan stays bounded exactly as the HIGH-5 guard intends, but
  // the user sees the most recent year of data under the label they picked
  // instead of a silent, unexplained 7-day window. The cap counts inclusive
  // calendar days, so the earliest allowed `from` is `to` minus (MAX - 1) days.
  // This arithmetic stays on UTC-anchored date-KEYS (calendar-day subtraction
  // is timezone-independent) — only the final `since`/`until` instants below
  // are anchored to the viewer's timezone.
  const clampedSinceKeyBasis = new Date(`${to}T00:00:00.000Z`)
  clampedSinceKeyBasis.setUTCDate(
    clampedSinceKeyBasis.getUTCDate() - (MAX_ADS_ANALYTICS_RANGE_DAYS - 1),
  )
  const clampedFrom = clampedSinceKeyBasis.toISOString().slice(0, 10)

  return {
    since: zonedDayStart(clampedFrom, timezone),
    until,
    from: clampedFrom,
    to,
    timezone,
  }
}
