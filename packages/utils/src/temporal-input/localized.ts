import { parseWithFormats, TIME_PATTERNS } from "./formats"
import { NORMALIZED_MERIDIEM_PATTERN } from "./meridiem"
import { escapeRegExp } from "./regexp"
import type { TemporalParseResult } from "./types"

type LocalizedDateComponent = "day" | "month" | "year"
type LocalizedDateLabelPosition = "before" | "after"

/**
 * One labelled number inside a localized date — the `7` in `tháng 7`, together
 * with which side its label sits on and whether the label may be omitted.
 */
type LocalizedDateComponentToken = {
  readonly component: LocalizedDateComponent
  readonly labelPosition: LocalizedDateLabelPosition
  readonly labels: readonly string[]
  readonly optionalLabel?: boolean
}

type LocalizedDateTimeFormat = {
  readonly name: string
  readonly tokens: readonly LocalizedDateComponentToken[]
  readonly timeLabels?: readonly string[]
}

/**
 * EXTENSION POINT — describe a locale's spelled-out date grammar here.
 *
 * Declaring the grammar as tokens rather than a hand-written regex is what lets
 * a new locale be added without touching the builders below. Only numeric months
 * are covered on purpose: matching localized month *names* would need a full
 * locale table, and Google Sheets writes the numeric form.
 */
const LOCALIZED_DATE_TIME_FORMATS: readonly LocalizedDateTimeFormat[] = [
  {
    name: "day numeric-month year",
    tokens: [
      {
        component: "day",
        labelPosition: "before",
        labels: ["ngày"],
        optionalLabel: true,
      },
      {
        component: "month",
        labelPosition: "before",
        labels: ["thg", "tháng"],
      },
      {
        component: "year",
        labelPosition: "before",
        labels: ["năm"],
        optionalLabel: true,
      },
    ],
    timeLabels: ["lúc"],
  },
]

/**
 * A localized value is rewritten to `yyyy-MM-dd <clock>` before parsing, so it
 * inherits the shared clock shapes and never drifts from them.
 */
const LOCALIZED_CANONICAL_FORMATS: readonly string[] = [
  ...TIME_PATTERNS.map((time) => `yyyy-MM-dd ${time}`),
  "yyyy-MM-dd",
]

/**
 * The clock half of a localized value. The meridiem tail is optional so both
 * `lúc 9:30` and `lúc 9:30 CH` match, and it reuses the normalized spelling
 * because meridiem normalization has already run by the time this pattern is
 * applied.
 */
const LOCALIZED_CLOCK_PATTERN = `\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s*${NORMALIZED_MERIDIEM_PATTERN})?`

const buildLabelPattern = (
  labels: readonly string[],
  optional = false,
): string => {
  const alternatives = labels.map(escapeRegExp).join("|")
  const labelPattern = `(?:${alternatives})`
  return optional ? `${labelPattern}?` : labelPattern
}

const buildDateTokenPattern = (token: LocalizedDateComponentToken): string => {
  const valuePattern = `(?<${token.component}>\\d{1,4})`
  const labelPattern = buildLabelPattern(token.labels, token.optionalLabel)

  return token.labelPosition === "before"
    ? `${labelPattern}\\s*${valuePattern}`
    : `${valuePattern}\\s*${labelPattern}`
}

const buildTimePattern = (labels: readonly string[] = []): string => {
  const labelPattern = labels.length
    ? `${buildLabelPattern(labels, true)}\\s*`
    : ""

  return `(?:\\s*${labelPattern}(?<time>${LOCALIZED_CLOCK_PATTERN}))?`
}

const buildDateTimePattern = (
  formatConfig: LocalizedDateTimeFormat,
): RegExp => {
  const datePattern = formatConfig.tokens
    .map(buildDateTokenPattern)
    .join("\\s*,?\\s*")

  return new RegExp(
    `^${datePattern}${buildTimePattern(formatConfig.timeLabels)}$`,
    "i",
  )
}

const LOCALIZED_DATE_TIME_PATTERNS =
  LOCALIZED_DATE_TIME_FORMATS.map(buildDateTimePattern)

/**
 * Recognizes a spelled-out date such as `ngày 23 tháng 7 năm 2026 lúc 9:30 CH`
 * by rewriting it to the canonical `yyyy-MM-dd <clock>` shape and re-parsing.
 */
export const matchLocalizedDateTimeInput = (
  raw: string,
): TemporalParseResult | null => {
  for (const pattern of LOCALIZED_DATE_TIME_PATTERNS) {
    const groups = pattern.exec(raw)?.groups
    if (!groups) {
      continue
    }

    const datePart = `${groups.year}-${groups.month.padStart(2, "0")}-${groups.day.padStart(2, "0")}`
    const canonicalValue = groups.time ? `${datePart} ${groups.time}` : datePart
    const parsed = parseWithFormats(canonicalValue, LOCALIZED_CANONICAL_FORMATS)
    if (parsed) {
      return { kind: "naive", date: parsed }
    }
  }

  return null
}
