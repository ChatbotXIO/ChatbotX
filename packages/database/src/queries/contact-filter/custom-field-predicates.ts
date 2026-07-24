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
import { type SQL, sql } from "drizzle-orm"
import {
  customFieldTypes,
  type OperatorType,
  operatorTypes,
} from "../../partials"
import { contactCustomFieldModel, customFieldModel } from "../../schema"
import { escapeLikePattern, likeContains } from "../../utils"
import { existsWhere } from "./exists"
import type { ContactWhere } from "./types"
import {
  isValidDateTimeFilterValue,
  NUMERIC_VALUE_PATTERN,
} from "./value-format"

type CustomFieldComparison = { predicate: SQL; negate: boolean }
type IntervalValue = [string, string]

const NEGATION_TO_POSITIVE: Partial<Record<OperatorType, OperatorType>> = {
  [operatorTypes.enum.ne]: operatorTypes.enum.eq,
  [operatorTypes.enum.notContains]: operatorTypes.enum.contains,
  [operatorTypes.enum.notBetween]: operatorTypes.enum.isBetween,
  [operatorTypes.enum.isEmpty]: operatorTypes.enum.isNotEmpty,
}

export function buildCustomFieldWhere(condition: {
  customFieldId?: string
  operator: string
  value?: unknown
  customFieldType?: string
  valueType?: string
  timezone: string
}): ContactWhere {
  if (!condition.customFieldId) {
    return {}
  }
  const comparison = buildCustomFieldComparison(
    condition.customFieldId,
    condition.operator,
    condition.value,
    condition.customFieldType,
    condition.valueType,
    condition.timezone,
  )
  if (!comparison) {
    return {}
  }

  return existsWhere(
    (contactId) =>
      sql`SELECT 1 FROM ${contactCustomFieldModel} WHERE ${contactCustomFieldModel.contactId} = ${contactId} AND ${contactCustomFieldModel.customFieldId} = ${condition.customFieldId} AND ${comparison.predicate}`,
    comparison.negate,
  )
}

function buildCustomFieldComparison(
  customFieldId: string,
  operator: string,
  value: unknown,
  customFieldType: string | undefined,
  valueType: string | undefined,
  timezone: string,
): CustomFieldComparison | undefined {
  const positiveOperator = NEGATION_TO_POSITIVE[operator as OperatorType]
  const negate = positiveOperator !== undefined
  const predicate = buildCustomFieldPositivePredicate(
    positiveOperator ?? operator,
    customFieldId,
    value,
    customFieldType,
    valueType,
    timezone,
  )
  return predicate ? { predicate, negate } : undefined
}

function buildCustomFieldPositivePredicate(
  operator: string,
  customFieldId: string,
  value: unknown,
  customFieldType: string | undefined,
  valueType: string | undefined,
  timezone: string,
): SQL | undefined {
  if (operator === operatorTypes.enum.isNotEmpty) {
    const column = contactCustomFieldModel.value
    return sql`(${column} IS NOT NULL AND ${column} <> '')`
  }

  const intervalValue = getCustomFieldIntervalValue(value)
  if (valueType === "number") {
    return buildNumberCustomFieldPredicate(operator, value, intervalValue)
  }
  if (valueType === "datetime") {
    return buildDatetimeCustomFieldPredicate(
      operator,
      customFieldId,
      value,
      customFieldType,
      intervalValue,
      timezone,
    )
  }
  return buildTextCustomFieldPredicate(operator, value)
}

function getCustomFieldIntervalValue(
  value: unknown,
): IntervalValue | undefined {
  return Array.isArray(value) &&
    typeof value[0] === "string" &&
    typeof value[1] === "string" &&
    value[0] !== "" &&
    value[1] !== ""
    ? [value[0], value[1]]
    : undefined
}

function buildNumberCustomFieldPredicate(
  operator: string,
  value: unknown,
  intervalValue: IntervalValue | undefined,
): SQL | undefined {
  const column = contactCustomFieldModel.value
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

type TemporalCast = "timestamp" | "timestamptz"

/**
 * The stored value cast to a temporal type, guarded so a corrupt/legacy row
 * yields NULL (never matches) instead of throwing. `::timestamp` keeps the
 * wall-clock fields and drops any offset (naive); `::timestamptz` keeps the
 * true instant. A value valid as timestamptz is always valid as timestamp, so
 * the same guard covers both casts.
 */
function guardedTemporal(guard: SQL, cast: TemporalCast): SQL {
  const column = contactCustomFieldModel.value
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
  operator: string,
  guard: SQL,
  startIso: string,
  endIso: string,
  cast: TemporalCast,
): SQL | undefined {
  const stored = guardedTemporal(guard, cast)
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

function buildDatetimeCustomFieldPredicate(
  operator: string,
  customFieldId: string,
  value: unknown,
  customFieldType: string | undefined,
  intervalValue: IntervalValue | undefined,
  timezone: string,
): SQL | undefined {
  const column = contactCustomFieldModel.value
  // pg_input_is_valid (PG16+) rejects exactly the values a temporal cast would
  // throw on, so a corrupt or legacy-garbage stored value degrades to NULL
  // instead of crashing the whole filter query.
  const guard = sql`(${column} IS NOT NULL AND ${column} <> '' AND pg_input_is_valid(${column}, 'timestamptz'))`
  if (customFieldType === undefined) {
    return buildLegacyTemporalCustomFieldPredicate(
      operator,
      customFieldId,
      value,
      intervalValue,
      timezone,
      guard,
    )
  }

  return buildTemporalBranchPredicate({
    guard,
    intervalValue,
    isDateField: customFieldType === customFieldTypes.enum.date,
    operator,
    timezone,
    value,
  })
}

function buildLegacyTemporalCustomFieldPredicate(
  operator: string,
  customFieldId: string,
  value: unknown,
  intervalValue: IntervalValue | undefined,
  timezone: string,
  guard: SQL,
): SQL | undefined {
  const datePredicate = buildTemporalBranchPredicate({
    guard,
    intervalValue,
    isDateField: true,
    operator,
    timezone,
    value,
  })
  const datetimePredicate = buildTemporalBranchPredicate({
    guard,
    intervalValue,
    isDateField: false,
    operator,
    timezone,
    value,
  })

  if (!(datePredicate && datetimePredicate)) {
    return
  }

  const isDateField = sql`EXISTS (
    SELECT 1
    FROM ${customFieldModel}
    WHERE ${customFieldModel.id} = ${customFieldId}
      AND ${customFieldModel.type} = ${customFieldTypes.enum.date}
  )`

  return sql`((${isDateField} AND ${datePredicate}) OR (NOT ${isDateField} AND ${datetimePredicate}))`
}

function buildTemporalBranchPredicate(input: {
  guard: SQL
  intervalValue: IntervalValue | undefined
  isDateField: boolean
  operator: string
  timezone: string
  value: unknown
}): SQL | undefined {
  const { guard, intervalValue, isDateField, operator, timezone, value } = input

  if (operator === operatorTypes.enum.isBetween) {
    return buildTemporalRangePredicate(
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
    ? buildDateFieldPredicate(operator, value, timezone, guard)
    : buildDatetimeInstantPredicate(operator, value, timezone, guard)
}

/**
 * DATETIME field: always zone-aware. The match precision follows the typed
 * precision — a date matches the whole day, `09:30` the whole minute, `09:30:45`
 * the whole second — all as a window in the criteria zone. A naive value is
 * anchored to `timezone`; a value with its own offset keeps it.
 */
function buildDatetimeInstantPredicate(
  operator: string,
  value: string,
  timezone: string,
  guard: SQL,
): SQL | undefined {
  const { startIso, endIso } = filterValueToUtcInstantWindow(value, timezone)
  return buildTemporalWindowComparison(
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
      operator,
      guard,
      start,
      end,
      "timestamp",
    )
  }

  return buildNaiveDateOnlyPredicate(operator, guard, value)
}

function buildNaiveDateOnlyPredicate(
  operator: string,
  guard: SQL,
  value: string,
): SQL | undefined {
  const column = contactCustomFieldModel.value

  if (operator === operatorTypes.enum.eq) {
    // Compare the stored calendar-day prefix directly — no cast, no zone.
    return sql`(${column} IS NOT NULL AND ${column} <> '' AND left(${column}, ${DATE_PART_LENGTH}) = ${datePartOf(value)})`
  }

  // Ordered comparisons treat the day as a naive [00:00, next-00:00) window.
  // Passing "UTC" keeps the boundaries free of any zone shift; ::timestamp then
  // drops the trailing Z, leaving the wall-clock day edges.
  const stored = guardedTemporal(guard, "timestamp")
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
  intervalValue: IntervalValue | undefined,
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
  const stored = guardedTemporal(guard, cast)
  const loStart = instant
    ? filterValueToUtcInstantWindow(lo, timezone).startIso
    : temporalWallClockWindow(lo).start
  const hiEnd = instant
    ? filterValueToUtcInstantWindow(hi, timezone).endIso
    : temporalWallClockWindow(hi).end
  return sql`(${guard} AND ${stored} >= ${temporalOperand(loStart, cast)} AND ${stored} < ${temporalOperand(hiEnd, cast)})`
}

function buildTextCustomFieldPredicate(
  operator: string,
  value: unknown,
): SQL | undefined {
  if (typeof value !== "string" || value === "") {
    return
  }

  const column = contactCustomFieldModel.value
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
