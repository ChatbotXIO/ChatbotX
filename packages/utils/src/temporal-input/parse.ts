import { format } from "date-fns"
import { formatInTimeZone } from "date-fns-tz"
import {
  resolveFilterTimezone,
  type TemporalCustomFieldType,
} from "../datetime"
import { NAIVE_OUTPUT_FORMATS } from "./formats"
import { matchLocalizedDateTimeInput } from "./localized"
import {
  matchCanonicalFormatInput,
  matchOffsetInput,
  matchTimeOnlyInput,
  matchUnixTimestampInput,
} from "./matchers"
import { normalizeMeridiemSuffix } from "./meridiem"
import type {
  TemporalMatchContext,
  TemporalMatcher,
  TemporalParseResult,
} from "./types"

/**
 * EXTENSION POINT — register a new way of recognizing a cell here.
 *
 * First match wins, so order is policy, not style: the two absolute shapes go
 * first because they must never be re-anchored, dated shapes next, and the
 * time-only fallback last so it can only ever see values every dated shape has
 * already declined.
 */
const TEMPORAL_MATCHERS: readonly TemporalMatcher[] = [
  { name: "offset", match: matchOffsetInput },
  { name: "unix", match: matchUnixTimestampInput },
  { name: "canonical-format", match: matchCanonicalFormatInput },
  { name: "localized-date-time", match: matchLocalizedDateTimeInput },
  { name: "time-only", match: matchTimeOnlyInput },
]

/**
 * Renders a match into the canonical string for its field type. An `absolute`
 * result already names an instant, so a `datetime` keeps it verbatim while a
 * `date` collapses it to whichever calendar day it fell on in the anchor zone.
 */
const projectTemporalResult = (
  type: TemporalCustomFieldType,
  result: TemporalParseResult,
  anchorTimezone: string,
): string => {
  if (result.kind === "absolute") {
    return type === "date"
      ? formatInTimeZone(
          result.instant,
          anchorTimezone,
          NAIVE_OUTPUT_FORMATS.date,
        )
      : result.instant.toISOString()
  }

  return format(result.date, NAIVE_OUTPUT_FORMATS[type])
}

/**
 * Best-effort parse of a raw spreadsheet cell into a canonical string that
 * `normalizeTemporalCustomFieldValue` accepts. Returns null when no matcher
 * recognizes the input.
 *
 * `now` only matters for inputs that omit a calendar day (a bare clock time);
 * it is a parameter so callers can pin it in tests.
 */
export const parseLooseTemporalValue = (
  type: TemporalCustomFieldType,
  raw: string,
  anchorTimezone: string | null | undefined,
  now: Date = new Date(),
): string | null => {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return null
  }

  const normalized = normalizeMeridiemSuffix(trimmed)
  const safeTimezone = resolveFilterTimezone(anchorTimezone)
  const context: TemporalMatchContext = { timezone: safeTimezone, now }

  for (const matcher of TEMPORAL_MATCHERS) {
    const result = matcher.match(normalized, context)
    if (result) {
      return projectTemporalResult(type, result, safeTimezone)
    }
  }

  return null
}
