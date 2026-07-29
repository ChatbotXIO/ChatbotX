import { format, isValid, parse } from "date-fns"
import { formatInTimeZone } from "date-fns-tz"
import { hasExplicitOffset } from "../datetime"
import {
  CANONICAL_INPUT_FORMATS,
  NAIVE_OUTPUT_FORMATS,
  parseWithFormats,
  REFERENCE_DATE,
  TIME_PATTERNS,
} from "./formats"
import type { TemporalMatchContext, TemporalParseResult } from "./types"

const UNIX_TIMESTAMP_PATTERN = /^[+-]?\d+$/
const LEADING_SIGN_PATTERN = /^[+-]/
const UNIX_SECONDS_DIGITS = 10
const UNIX_MILLISECONDS_DIGITS = 13

/** A value carrying its own offset already names an instant — keep it as-is. */
export const matchOffsetInput = (raw: string): TemporalParseResult | null => {
  if (!hasExplicitOffset(raw)) {
    return null
  }

  const instant = new Date(raw)
  return isValid(instant) ? { kind: "absolute", instant } : null
}

/**
 * Digit count is the whole discriminator: exactly 10 digits is seconds, exactly
 * 13 is milliseconds. Anything else is some other numeric the sheet happens to
 * hold — a spreadsheet serial date, a bare year — and must not be reinterpreted
 * as an instant.
 */
export const matchUnixTimestampInput = (
  raw: string,
): TemporalParseResult | null => {
  if (!UNIX_TIMESTAMP_PATTERN.test(raw)) {
    return null
  }

  const digitCount = raw.replace(LEADING_SIGN_PATTERN, "").length
  if (
    digitCount !== UNIX_SECONDS_DIGITS &&
    digitCount !== UNIX_MILLISECONDS_DIGITS
  ) {
    return null
  }

  const numeric = Number(raw)
  if (!Number.isFinite(numeric)) {
    return null
  }

  const milliseconds =
    digitCount === UNIX_MILLISECONDS_DIGITS ? numeric : numeric * 1000
  const instant = new Date(milliseconds)
  return isValid(instant) ? { kind: "absolute", instant } : null
}

export const matchCanonicalFormatInput = (
  raw: string,
): TemporalParseResult | null => {
  const parsed = parseWithFormats(raw, CANONICAL_INPUT_FORMATS)
  return parsed ? { kind: "naive", date: parsed } : null
}

/** Round-trip shapes used to graft a parsed clock time onto today's date. */
const TIME_ONLY_CLOCK_FORMAT = "HH:mm:ss.SSS"
const TIME_ONLY_ANCHORED_FORMAT = "yyyy-MM-dd HH:mm:ss.SSS"

/**
 * A cell holding only a clock time carries no calendar day, so it borrows the
 * current day *in the anchor zone* — a workspace in UTC+7 reading `09:30` just
 * after local midnight must get its own new day, not the server's previous one.
 */
export const matchTimeOnlyInput = (
  raw: string,
  { timezone, now }: TemporalMatchContext,
): TemporalParseResult | null => {
  const parsedTime = parseWithFormats(raw, TIME_PATTERNS)
  if (!parsedTime) {
    return null
  }

  const today = formatInTimeZone(now, timezone, NAIVE_OUTPUT_FORMATS.date)
  const anchored = parse(
    `${today} ${format(parsedTime, TIME_ONLY_CLOCK_FORMAT)}`,
    TIME_ONLY_ANCHORED_FORMAT,
    REFERENCE_DATE,
  )

  return isValid(anchored) ? { kind: "naive", date: anchored } : null
}
