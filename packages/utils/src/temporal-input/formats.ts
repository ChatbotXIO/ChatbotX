import { isValid, parse } from "date-fns"
import type { TemporalCustomFieldType } from "../datetime"

/**
 * Anchor date-fns fills in for components a format does not mention. Any fixed
 * date works; a constant one keeps parsing deterministic.
 */
export const REFERENCE_DATE = new Date(2000, 0, 1)

/**
 * EXTENSION POINT — add a clock shape here and every date shape gains it.
 *
 * Ordered most specific first. `H`/`h` accept both padded and unpadded hours, so
 * `9:30` and `09:30` are both covered, and a 24-hour clock and a meridiem clock
 * are equally valid whether the day was written day-first, month-first, or ISO.
 */
export const TIME_PATTERNS: readonly string[] = [
  "H:mm:ss.SSS",
  "H:mm:ss",
  "H:mm",
  "h:mm:ss a",
  "h:mm a",
  "h a",
]

type DateShape = {
  readonly pattern: string
  /** What may sit between the date and the clock; only ISO-8601 uses `T`. */
  readonly separators: readonly string[]
}

/**
 * EXTENSION POINT — add a date shape here; it inherits every clock shape above.
 *
 * In precedence order: day-first deliberately outranks month-first so
 * `07/12/2026` reads as 7 December. Month-first still sits below as a rescue, so
 * an unambiguous `07/13/2026` (no 13th month) resolves correctly — only values
 * whose day AND month are both <= 12 are decided by this ordering.
 *
 * Making the order per-workspace configurable was considered and deferred; until
 * it exists, a month-first sheet silently misreads that ambiguous ~39%. Don't
 * reorder these to "fix" a report of a wrong date — that just moves the silent
 * failure onto day-first sheets.
 */
const DATE_SHAPES: readonly DateShape[] = [
  { pattern: "yyyy-MM-dd", separators: ["'T'", " "] },
  { pattern: "d/M/yyyy", separators: [" "] },
  { pattern: "d-M-yyyy", separators: [" "] },
  { pattern: "d.M.yyyy", separators: [" "] },
  { pattern: "M/d/yyyy", separators: [" "] },
  { pattern: "d MMM yyyy", separators: [" "] },
  { pattern: "d MMMM yyyy", separators: [" "] },
  { pattern: "MMM d, yyyy", separators: [" "] },
  { pattern: "MMMM d, yyyy", separators: [" "] },
]

/** Shapes that carry no clock half; kept last so they never shadow a dated one. */
const DATE_ONLY_PATTERNS: readonly string[] = ["yyyyMMdd"]

/** Every clock variant of one date shape, with the bare date as the fallback. */
const buildDateShapeFormats = ({
  pattern,
  separators,
}: DateShape): readonly string[] => [
  ...separators.flatMap((separator) =>
    TIME_PATTERNS.map((time) => `${pattern}${separator}${time}`),
  ),
  pattern,
]

export const CANONICAL_INPUT_FORMATS: readonly string[] = [
  ...DATE_SHAPES.flatMap(buildDateShapeFormats),
  ...DATE_ONLY_PATTERNS,
]

/** The shape each field type is rendered back to once parsing succeeds. */
export const NAIVE_OUTPUT_FORMATS = {
  date: "yyyy-MM-dd",
  datetime: "yyyy-MM-dd'T'HH:mm:ss",
} as const satisfies Record<TemporalCustomFieldType, string>

/** First format that yields a valid date wins; null when none does. */
export const parseWithFormats = (
  value: string,
  patterns: readonly string[],
): Date | null => {
  for (const pattern of patterns) {
    const parsed = parse(value, pattern, REFERENCE_DATE)
    if (isValid(parsed)) {
      return parsed
    }
  }

  return null
}
