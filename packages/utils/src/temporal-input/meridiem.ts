import { escapeRegExp } from "./regexp"

/**
 * EXTENSION POINT — add a locale's meridiem spellings here.
 *
 * Spellings that mean "before noon" and "after noon" across the locales a
 * spreadsheet may have been authored in. `SA`/`CH` are what Google Sheets emits
 * under a Vietnamese locale — they are date-fns's own `vi` wide day periods —
 * and the spelled-out periods cover values a person typed by hand.
 *
 * `trưa` (noon) and `đêm` (night) are deliberately absent: both straddle the
 * 12-hour boundary, so "11 giờ trưa" is 11:00 while "12 giờ trưa" is 12:00, and
 * "1 giờ đêm" is 01:00 while "11 giờ đêm" is 23:00. Declining the cell beats
 * storing a value that is twelve hours wrong half the time.
 */
const MERIDIEM_ALIASES = {
  am: ["a.m", "am", "sa", "sáng", "sang"],
  pm: ["p.m", "pm", "ch", "chiều", "chieu", "tối", "toi"],
} as const satisfies Record<"am" | "pm", readonly string[]>

/**
 * What a meridiem marker looks like *after* normalization. Every alias above is
 * rewritten to this one spelling, so downstream patterns recognize a single
 * shape — importing this constant instead of re-spelling it keeps the two ends
 * of the pipeline from drifting apart.
 */
export const NORMALIZED_MERIDIEM_PATTERN = "[ap]m"

/**
 * Longest alias first so `a.m` is never half-consumed by the shorter `am`. The
 * closing dot is optional rather than part of the alias, which covers `a.m.`,
 * `a.m`, and `am.` from one entry. Anchored to end-of-string and to a preceding
 * digit — that anchor is what keeps ordinary words ending in these letters
 * ("diagram", "March") from being rewritten.
 */
const buildMeridiemPattern = (aliases: readonly string[]): RegExp => {
  const alternatives = [...aliases]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join("|")

  return new RegExp(`(\\d)\\s*(?:${alternatives})\\.?$`, "i")
}

const MERIDIEM_MARKER_PATTERNS = Object.entries(MERIDIEM_ALIASES).map(
  ([marker, aliases]) => ({ marker, pattern: buildMeridiemPattern(aliases) }),
)

/**
 * Rewrites whatever meridiem marker the sheet used into the plain `am`/`pm` the
 * date-fns `a` token understands, so every format downstream stays single-locale.
 *
 * Order-independent: once an `am` alias has been rewritten the result matches no
 * `pm` alias, and vice versa. That property breaks if the two lists ever overlap.
 */
export const normalizeMeridiemSuffix = (value: string): string =>
  MERIDIEM_MARKER_PATTERNS.reduce(
    (current, { marker, pattern }) => current.replace(pattern, `$1 ${marker}`),
    value,
  )
