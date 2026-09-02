import {
  BOOLEAN_LITERAL_PATTERN_SOURCE,
  canonicalBooleanLiteral,
} from "@chatbotx.io/utils/custom-field"
import {
  DATE_PART_LENGTH,
  DEFAULT_FILTER_TIMEZONE,
  datePartOf,
  filterValueToUtcDayEndIso,
  filterValueToUtcDayStartIso,
  filterValueToUtcInstantWindow,
  hasExplicitOffset,
  hasTimeComponent,
  temporalWallClockWindow,
} from "@chatbotx.io/utils/datetime"
import type { AnyColumn, SQL } from "drizzle-orm"
import { sql } from "drizzle-orm"
import {
  customFieldTypes,
  type OperatorType,
  operatorTypes,
} from "../../partials"
import { escapeLikePattern, likeContains } from "../../utils"
import {
  isValidDateTimeFilterValue,
  NUMERIC_VALUE_PATTERN,
} from "./value-format"

/**
 * Column-parametrized value comparison logic shared by the `customField`
 * (`custom-field-predicates.ts`, keyed on `ContactCustomField.value`) and
 * `botField` (`bot-field-predicates.ts`, keyed on `BotField.value`)
 * conditions. Both store a workspace-defined field's value as `text` and
 * compare it using the exact same type-aware casts/canonicalization — this
 * module is the single source for that logic so the two never drift.
 */

export type FieldValueComparison = { predicate: SQL; negate: boolean }
export type FieldIntervalValue = [string, string]

const NEGATION_TO_POSITIVE: Partial<Record<OperatorType, OperatorType>> = {
  [operatorTypes.enum.ne]: operatorTypes.enum.eq,
  [operatorTypes.enum.notContains]: operatorTypes.enum.contains,
  [operatorTypes.enum.notBetween]: operatorTypes.enum.isBetween,
  [operatorTypes.enum.isEmpty]: operatorTypes.enum.isNotEmpty,
}

/** Resolves a (possibly negative) operator to its positive form + a negate flag. */
export function resolveFieldValueNegation(operator: string): {
  positiveOperator: string
  negate: boolean
} {
  const positiveOperator = NEGATION_TO_POSITIVE[operator as OperatorType]
  return {
    positiveOperator: positiveOperator ?? operator,
    negate: positiveOperator !== undefined,
  }
}

export function getFieldIntervalValue(
  value: unknown,
): FieldIntervalValue | undefined {
  return Array.isArray(value) &&
    typeof value[0] === "string" &&
    typeof value[1] === "string" &&
    value[0] !== "" &&
    value[1] !== ""
    ? [value[0], value[1]]
    : undefined
}

/**
 * Top-level dispatcher: given the value column and a *positive* operator,
 * returns the SQL predicate that is TRUE when the stored value matches.
 * Callers wrap this with {@link resolveFieldValueNegation} to also handle
 * negative operators.
 *
 * The `datetime` branch requires a known `customFieldType` (`date` |
 * `datetime`) to pick date-vs-instant semantics; when it is `undefined` this
 * returns `undefined` and the caller must supply its own resolution (see
 * `buildLegacyTemporalCustomFieldPredicate` in `custom-field-predicates.ts` —
 * `botField` conditions always carry a type, so they never hit this branch).
 */
export function buildFieldValuePositivePredicate(input: {
  column: AnyColumn
  operator: string
  value: unknown
  customFieldType: string | undefined
  valueType: string | undefined
  timezone: string
}): SQL | undefined {
  const { column, operator, value, customFieldType, valueType, timezone } =
    input

  if (operator === operatorTypes.enum.isNotEmpty) {
    return sql`(${column} IS NOT NULL AND ${column} <> '')`
  }

  const intervalValue = getFieldIntervalValue(value)
  if (valueType === "number") {
    return buildNumberFieldPredicate(column, operator, value, intervalValue)
  }
  if (valueType === "boolean") {
    return buildBooleanFieldPredicate(column, operator, value)
  }
  if (valueType === "datetime") {
    if (customFieldType === undefined) {
      return
    }
    return buildDatetimeFieldPredicate({
      column,
      customFieldType,
      intervalValue,
      operator,
      timezone,
      value,
    })
  }
  return buildTextFieldPredicate(column, operator, value)
}

function buildNumberFieldPredicate(
  column: AnyColumn,
  operator: string,
  value: unknown,
  intervalValue: FieldIntervalValue | undefined,
): SQL | undefined {
  const numeric = sql`NULLIF(${column}, '')::numeric`
  const guard = sql`${column} ~ '^-?[0-9]+(\\.[0-9]+)?$'`

  if (operator === operatorTypes.enum.isBetween) {
    if (
      !(
        intervalValue &&
        NUMERIC_VALUE_PATTERN.test(intervalValue[0]) &&
        NUMERIC_VALUE_PATTERN.test(intervalValue[1])
      )
    ) {
      return
    }
    return sql`(${guard} AND ${numeric} >= ${Number(intervalValue[0])} AND ${numeric} <= ${Number(intervalValue[1])})`
  }

  if (typeof value !== "string" || value === "") {
    return
  }

  switch (operator) {
    case operatorTypes.enum.contains:
      return sql`${column} ILIKE ${likeContains(value)}`
    case operatorTypes.enum.startsWith:
      return sql`${column} ILIKE ${`${escapeLikePattern(value)}%`}`
    case operatorTypes.enum.endsWith:
      return sql`${column} ILIKE ${`%${escapeLikePattern(value)}`}`
    default:
      break
  }

  if (!NUMERIC_VALUE_PATTERN.test(value)) {
    return
  }

  const n = Number(value)
  switch (operator) {
    case operatorTypes.enum.eq:
      return sql`(${guard} AND ${numeric} = ${n})`
    case operatorTypes.enum.gt:
      return sql`(${guard} AND ${numeric} > ${n})`
    case operatorTypes.enum.gte:
      return sql`(${guard} AND ${numeric} >= ${n})`
    case operatorTypes.enum.lt:
      return sql`(${guard} AND ${numeric} < ${n})`
    case operatorTypes.enum.lte:
      return sql`(${guard} AND ${numeric} <= ${n})`
    default:
      return
  }
}

/**
 * `boolean` fields, guarded + cast the same way `number` is: a
 * whitespace-tolerant, case-insensitive literal guard (source shared with the
 * write-side normalizers via `BOOLEAN_LITERAL_PATTERN_SOURCE`, so SQL and JS
 * can never disagree on what "looks boolean") followed by a `NULLIF(...)::boolean`
 * cast that only ever runs on a value the guard already accepted. A legacy row
 * that fails the guard (blank or garbage like `"12313"`) yields NULL from the
 * cast and never matches `eq` — same "guarded, never throws" philosophy as the
 * numeric/datetime branches. Only `eq` is produced here; `isEmpty`/`isNotEmpty`
 * are handled generically above (only `''` counts as empty) and `ne` is not
 * offered by the UI but is handled for free by the caller, which negates `eq`
 * via {@link resolveFieldValueNegation} before wrapping it in `NOT EXISTS`.
 */
function buildBooleanFieldPredicate(
  column: AnyColumn,
  operator: string,
  value: unknown,
): SQL | undefined {
  if (operator !== operatorTypes.enum.eq) {
    return
  }
  if (typeof value !== "string" || value === "") {
    return
  }

  // The operand goes through the same literal registry as stored values, so
  // a typed "Yes"/"TRUE"/"1" compares as true instead of silently flipping to
  // false. An unrecognized operand can never equal a boolean-guarded value —
  // FALSE here (and, via the caller's negation wrap, "ne <garbage>" matches
  // every row), instead of the old `value === "true"` JS coercion.
  const canonical = canonicalBooleanLiteral(value)
  if (canonical === null) {
    return sql`FALSE`
  }

  const guard = sql`lower(btrim(${column})) ~ ${BOOLEAN_LITERAL_PATTERN_SOURCE}`
  const boolValue = sql`NULLIF(lower(btrim(${column})), '')::boolean`

  return sql`(${guard} AND ${boolValue} = ${canonical === "true"})`
}

type TemporalCast = "timestamp" | "timestamptz"

/**
 * The stored value cast to a temporal type, guarded so a corrupt/legacy row
 * yields NULL (never matches) instead of throwing. `::timestamp` keeps the
 * wall-clock fields and drops any offset (naive); `::timestamptz` keeps the
 * true instant. A value valid as timestamptz is always valid as timestamp, so
 * the same guard covers both casts.
 */
function guardedTemporal(
  column: AnyColumn,
  guard: SQL,
  cast: TemporalCast,
): SQL {
  return cast === "timestamp"
    ? sql`CASE WHEN ${guard} THEN NULLIF(${column}, '')::timestamp END`
    : sql`CASE WHEN ${guard} THEN NULLIF(${column}, '')::timestamptz END`
}

function temporalOperand(iso: string, cast: TemporalCast): SQL {
  return cast === "timestamp"
    ? sql`${iso}::timestamp`
    : sql`${iso}::timestamptz`
}

/**
 * Compares the stored value against a half-open precision window `[start, end)`.
 * Every operator is derived from the same window so they stay mutually
 * consistent — "Is" means inside the window, and the ordered operators pin to
 * whichever edge keeps `eq ⊂ gte`, `eq ⊂ lte`, and `gt`/`eq`/`lt` disjoint:
 *   eq  -> start <= v < end   (the whole typed unit, e.g. that exact minute)
 *   gte -> v >= start         (at or after the unit begins)
 *   gt  -> v >= end           (strictly after the whole unit)
 *   lt  -> v <  start         (strictly before the whole unit)
 *   lte -> v <  end           (at or before the whole unit ends)
 * `ne` is not handled here; the caller inverts `eq` via the outer negate flag.
 */
function buildTemporalWindowComparison(
  column: AnyColumn,
  operator: string,
  guard: SQL,
  startIso: string,
  endIso: string,
  cast: TemporalCast,
): SQL | undefined {
  const stored = guardedTemporal(column, guard, cast)
  const start = temporalOperand(startIso, cast)
  const end = temporalOperand(endIso, cast)
  switch (operator) {
    case operatorTypes.enum.eq:
      return sql`(${guard} AND ${stored} >= ${start} AND ${stored} < ${end})`
    case operatorTypes.enum.gt:
      return sql`(${guard} AND ${stored} >= ${end})`
    case operatorTypes.enum.gte:
      return sql`(${guard} AND ${stored} >= ${start})`
    case operatorTypes.enum.lt:
      return sql`(${guard} AND ${stored} < ${start})`
    case operatorTypes.enum.lte:
      return sql`(${guard} AND ${stored} < ${end})`
    default:
      return
  }
}

export function buildDatetimeGuard(column: AnyColumn): SQL {
  // pg_input_is_valid (PG16+) rejects exactly the values a temporal cast would
  // throw on, so a corrupt or legacy-garbage stored value degrades to NULL
  // instead of crashing the whole filter query.
  return sql`(${column} IS NOT NULL AND ${column} <> '' AND pg_input_is_valid(${column}, 'timestamptz'))`
}

export function buildDatetimeFieldPredicate(input: {
  column: AnyColumn
  operator: string
  value: unknown
  customFieldType: string
  intervalValue: FieldIntervalValue | undefined
  timezone: string
}): SQL | undefined {
  const { column, operator, value, customFieldType, intervalValue, timezone } =
    input
  const guard = buildDatetimeGuard(column)

  return buildTemporalBranchPredicate({
    column,
    guard,
    intervalValue,
    isDateField: customFieldType === customFieldTypes.enum.date,
    operator,
    timezone,
    value,
  })
}

export function buildTemporalBranchPredicate(input: {
  column: AnyColumn
  guard: SQL
  intervalValue: FieldIntervalValue | undefined
  isDateField: boolean
  operator: string
  timezone: string
  value: unknown
}): SQL | undefined {
  const {
    column,
    guard,
    intervalValue,
    isDateField,
    operator,
    timezone,
    value,
  } = input

  if (operator === operatorTypes.enum.isBetween) {
    return buildTemporalRangePredicate(
      column,
      intervalValue,
      isDateField,
      timezone,
      guard,
    )
  }

  if (
    typeof value !== "string" ||
    value === "" ||
    !isValidDateTimeFilterValue(value)
  ) {
    return
  }

  return isDateField
    ? buildDateFieldPredicate(column, operator, value, timezone, guard)
    : buildDatetimeInstantPredicate(column, operator, value, timezone, guard)
}

/**
 * DATETIME field: always zone-aware. The match precision follows the typed
 * precision — a date matches the whole day, `09:30` the whole minute, `09:30:45`
 * the whole second — all as a window in the criteria zone. A naive value is
 * anchored to `timezone`; a value with its own offset keeps it.
 */
function buildDatetimeInstantPredicate(
  column: AnyColumn,
  operator: string,
  value: string,
  timezone: string,
  guard: SQL,
): SQL | undefined {
  const { startIso, endIso } = filterValueToUtcInstantWindow(value, timezone)
  return buildTemporalWindowComparison(
    column,
    operator,
    guard,
    startIso,
    endIso,
    "timestamptz",
  )
}

/**
 * DATE field: compared by wall clock, ignoring the criteria/browser zone. Like
 * the datetime field, the match precision follows the typed precision, but an
 * explicit offset in the typed value is the ONLY trigger for zone-aware
 * (instant) comparison — the user must type an offset before we compare by zone.
 *   - value with offset      -> instant window (::timestamptz), offset honored
 *   - value with a time part -> wall-clock window (::timestamp), no shift
 *   - date only              -> naive [00:00, next-00:00) day window
 */
function buildDateFieldPredicate(
  column: AnyColumn,
  operator: string,
  value: string,
  timezone: string,
  guard: SQL,
): SQL | undefined {
  if (hasExplicitOffset(value)) {
    // The value carries its own offset, so the window is anchored by that
    // offset rather than by `timezone`.
    const { startIso, endIso } = filterValueToUtcInstantWindow(value, timezone)
    return buildTemporalWindowComparison(
      column,
      operator,
      guard,
      startIso,
      endIso,
      "timestamptz",
    )
  }

  if (hasTimeComponent(value)) {
    const { start, end } = temporalWallClockWindow(value)
    return buildTemporalWindowComparison(
      column,
      operator,
      guard,
      start,
      end,
      "timestamp",
    )
  }

  return buildNaiveDateOnlyPredicate(column, operator, guard, value)
}

function buildNaiveDateOnlyPredicate(
  column: AnyColumn,
  operator: string,
  guard: SQL,
  value: string,
): SQL | undefined {
  if (operator === operatorTypes.enum.eq) {
    // Compare the stored calendar-day prefix directly — no cast, no zone.
    return sql`(${column} IS NOT NULL AND ${column} <> '' AND left(${column}, ${DATE_PART_LENGTH}) = ${datePartOf(value)})`
  }

  // Ordered comparisons treat the day as a naive [00:00, next-00:00) window.
  // Passing "UTC" keeps the boundaries free of any zone shift; ::timestamp then
  // drops the trailing Z, leaving the wall-clock day edges.
  const stored = guardedTemporal(column, guard, "timestamp")
  const dayStart = filterValueToUtcDayStartIso(value, DEFAULT_FILTER_TIMEZONE)
  const dayEnd = filterValueToUtcDayEndIso(value, DEFAULT_FILTER_TIMEZONE)
  switch (operator) {
    case operatorTypes.enum.gt:
      return sql`(${guard} AND ${stored} >= ${dayEnd}::timestamp)`
    case operatorTypes.enum.gte:
      return sql`(${guard} AND ${stored} >= ${dayStart}::timestamp)`
    case operatorTypes.enum.lt:
      return sql`(${guard} AND ${stored} < ${dayStart}::timestamp)`
    case operatorTypes.enum.lte:
      return sql`(${guard} AND ${stored} < ${dayEnd}::timestamp)`
    default:
      return
  }
}

/**
 * Range comparison for both temporal field types. A datetime field is always
 * instant-based; a date field stays naive unless BOTH bounds carry an explicit
 * offset, so a range means exactly the wall-clock values the user typed.
 *
 * Each bound follows the precision the user typed, matching every other temporal
 * operator in this file: the lower bound floors to the START of its unit and the
 * upper bound extends to the END of its own, then the whole range is a half-open
 * `[loStart, hiEnd)`. So "From 12:12 To 12:12" spans the entire 12:12 minute
 * (`[12:12:00, 12:13:00)`) — a stored 12:12:12 is inside it — instead of pinning
 * the top to the bare instant 12:12:00 and dropping the rest of the minute.
 */
function buildTemporalRangePredicate(
  column: AnyColumn,
  intervalValue: FieldIntervalValue | undefined,
  isDateField: boolean,
  timezone: string,
  guard: SQL,
): SQL | undefined {
  if (
    !(
      intervalValue &&
      isValidDateTimeFilterValue(intervalValue[0]) &&
      isValidDateTimeFilterValue(intervalValue[1])
    )
  ) {
    return
  }
  const [lo, hi] = intervalValue
  const instant =
    !isDateField || (hasExplicitOffset(lo) && hasExplicitOffset(hi))
  const cast: TemporalCast = instant ? "timestamptz" : "timestamp"
  const stored = guardedTemporal(column, guard, cast)
  const loStart = instant
    ? filterValueToUtcInstantWindow(lo, timezone).startIso
    : temporalWallClockWindow(lo).start
  const hiEnd = instant
    ? filterValueToUtcInstantWindow(hi, timezone).endIso
    : temporalWallClockWindow(hi).end
  return sql`(${guard} AND ${stored} >= ${temporalOperand(loStart, cast)} AND ${stored} < ${temporalOperand(hiEnd, cast)})`
}

function buildTextFieldPredicate(
  column: AnyColumn,
  operator: string,
  value: unknown,
): SQL | undefined {
  if (typeof value !== "string" || value === "") {
    return
  }

  switch (operator) {
    case operatorTypes.enum.eq:
      return sql`${column} = ${value}`
    case operatorTypes.enum.contains:
      return sql`${column} ILIKE ${likeContains(value)}`
    case operatorTypes.enum.startsWith:
      return sql`${column} ILIKE ${`${escapeLikePattern(value)}%`}`
    case operatorTypes.enum.endsWith:
      return sql`${column} ILIKE ${`%${escapeLikePattern(value)}`}`
    default:
      return
  }
}
