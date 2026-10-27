import type { SQL } from "@chatbotx.io/database/client"
import { and, sql } from "@chatbotx.io/database/client"
import { pipelineItemModel } from "@chatbotx.io/database/schema"
import type { CustomFieldType } from "@chatbotx.io/utils/custom-field"
import {
  isPipelineFilterDay,
  isPipelineFilterNumber,
  PIPELINE_FIELD_COMPARISON_KIND,
  type PipelineFieldComparisonKind,
  type PipelineFieldConditionInput,
  type PipelineFieldOperator,
} from "../../partials/pipeline"
import { escapeLikePattern } from "../../utils"

// Stored temporal values are ISO strings with an offset (`2026-05-20T00:00:00+07:00`)
// or `Z`. The pattern admits only strings `::timestamptz` can always parse
// (real month/day lengths, leap years), so a malformed value is skipped
// instead of aborting the whole query.
const DAY_OF_MONTH =
  "(0[13578]|1[02])-(0[1-9]|[12][0-9]|3[01])|(0[469]|11)-(0[1-9]|[12][0-9]|30)|02-(0[1-9]|1[0-9]|2[0-8])"
// Years 0001-9999 only: Postgres rejects year 0000.
const YEAR = "(000[1-9]|00[1-9][0-9]|0[1-9][0-9]{2}|[1-9][0-9]{3})"
// Leap years 0004-9996 (0000 is not a Postgres year).
const LEAP_YEAR =
  "(([0-9]{2}(0[48]|[2468][048]|[13579][26]))|((0[48]|[2468][048]|[13579][26])00))"
const STORED_TEMPORAL_PATTERN = `^((${YEAR}-(${DAY_OF_MONTH}))|(${LEAP_YEAR}-02-29))T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\\.[0-9]{1,6})?(Z|[+-](0[0-9]|1[0-5]):[0-5][0-9])$`

// Plain decimals, plus the exponent form `canonicalNumberLiteral` writes for
// very small/large values (`String(1e-7)` is "1e-7"); bounded so the cast stays cheap.
const NUMERIC_STORED_PATTERN = "^-?[0-9]+(\\.[0-9]+)?(e[-+][0-9]{1,3})?$"
const BOOLEAN_STORED_VALUES = ["true", "false"]
const FALLBACK_TIMEZONE = "UTC"

/**
 * One custom-field condition (the partials' shape, so validation and SQL
 * share it). Number operands are numeric strings, date operands
 * `YYYY-MM-DD`, boolean operands `true`/`false`.
 */
export type PipelineFieldCondition = PipelineFieldConditionInput

type FieldConditionContext = {
  /** The stored value as text (`fieldValues ->> id`). */
  stored: SQL
  condition: PipelineFieldCondition
  timezone: string
}

/** Builds the SQL of one operator for one comparison kind; `undefined` = no usable operand. */
type FieldOperatorStrategy = (context: FieldConditionContext) => SQL | undefined

const isKnownTimezone = (timezone: string | undefined): timezone is string => {
  if (!timezone) {
    return false
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

const isNonEmpty = (text: string | undefined): text is string =>
  text !== undefined && text !== ""

/**
 * Compares a derived, comparable expression (`subject`, NULL when the stored
 * value is absent or malformed) with typed operands. Shared by the ordered
 * kinds (number, date). `isNot` requires a value, so absent never matches.
 */
const orderedStrategy =
  (
    subjectOf: (context: FieldConditionContext) => SQL,
    operandOf: (text: string | undefined) => SQL | undefined,
  ): FieldOperatorStrategy =>
  (context) => {
    const { operator, value, valueTo } = context.condition
    const subject = subjectOf(context)
    const operand = operandOf(value)
    if (operator === "between") {
      const upper = operandOf(valueTo)
      const bounds = [
        operand ? sql`${subject} >= ${operand}` : undefined,
        upper ? sql`${subject} <= ${upper}` : undefined,
      ].filter((bound): bound is SQL => bound !== undefined)
      return bounds.length > 0 ? and(...bounds) : undefined
    }
    if (!operand) {
      return
    }
    switch (operator) {
      case "is":
        return sql`${subject} = ${operand}`
      case "isNot":
        return sql`${subject} <> ${operand}`
      case "gt":
        return sql`${subject} > ${operand}`
      case "lt":
        return sql`${subject} < ${operand}`
      default:
        return
    }
  }

const numberStrategy = orderedStrategy(
  ({ stored }) =>
    // The cast only runs inside a CASE guarded by the pattern, so a malformed
    // stored value is NULL instead of aborting the query.
    sql`(case when ${stored} ~ ${NUMERIC_STORED_PATTERN} then ${stored}::numeric end)`,
  (text) => (isPipelineFilterNumber(text) ? sql`${text}::numeric` : undefined),
)

const dayOperand = (text: string | undefined) =>
  isPipelineFilterDay(text) ? sql`${text}::date` : undefined

/**
 * A `date` field stores the picked day as midnight in the writer's zone
 * (`2026-05-20T00:00:00+07:00`) and is shown as that day, so it compares the
 * written day, ignoring the zone (like the contact filter). Malformed values
 * are NULL. `isNot` = has a well-formed value on a different day.
 */
const dateStrategy = orderedStrategy(
  ({ stored }) =>
    sql`(case when ${stored} ~ ${STORED_TEMPORAL_PATTERN} then left(${stored}, 10)::date end)`,
  dayOperand,
)

/** A `datetime` is an instant: its calendar day in the filter's `timezone`. */
const datetimeStrategy = orderedStrategy(
  ({ stored, timezone }) =>
    sql`((case when ${stored} ~ ${STORED_TEMPORAL_PATTERN} then ${stored}::timestamptz end) at time zone ${timezone})::date`,
  dayOperand,
)

const LIKE_OPERATORS: ReadonlySet<PipelineFieldOperator> = new Set([
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
])

const likeOperand = (operator: PipelineFieldOperator, text: string): string => {
  const escaped = escapeLikePattern(text)
  if (operator === "startsWith") {
    return `${escaped}%`
  }
  if (operator === "endsWith") {
    return `%${escaped}`
  }
  return `%${escaped}%`
}

/** Text: `is`/`isNot` exact, the rest case-insensitive. Negations require a value. */
const textStrategy: FieldOperatorStrategy = ({ stored, condition }) => {
  const { operator, value } = condition
  if (!isNonEmpty(value)) {
    return
  }
  if (operator === "is") {
    return sql`${stored} = ${value}`
  }
  if (operator === "isNot") {
    return sql`(${stored} is not null and ${stored} <> '' and ${stored} <> ${value})`
  }
  if (!LIKE_OPERATORS.has(operator)) {
    return
  }
  const pattern = likeOperand(operator, value)
  if (operator === "notContains") {
    return sql`(${stored} is not null and ${stored} <> '' and ${stored} not ilike ${pattern})`
  }
  return sql`coalesce(${stored} ilike ${pattern}, false)`
}

/** Boolean: stored `true`/`false`; `isNot` needs a stored boolean that differs. */
const booleanStrategy: FieldOperatorStrategy = ({ stored, condition }) => {
  const { operator, value } = condition
  if (!(value && BOOLEAN_STORED_VALUES.includes(value))) {
    return
  }
  if (operator === "is") {
    return sql`${stored} = ${value}`
  }
  if (operator === "isNot") {
    return sql`(${stored} in ('true', 'false') and ${stored} <> ${value})`
  }
}

const FIELD_STRATEGY_BY_KIND: Record<
  PipelineFieldComparisonKind,
  FieldOperatorStrategy
> = {
  text: textStrategy,
  number: numberStrategy,
  date: dateStrategy,
  datetime: datetimeStrategy,
  boolean: booleanStrategy,
}

/**
 * One custom-field condition; `undefined` when it lacks the operand it needs
 * or the operator does not apply to the field's kind. Presence is the same for
 * every kind: a missing key or an empty string is "no value".
 */
export function fieldConditionSql(
  fieldId: string,
  fieldType: CustomFieldType,
  condition: PipelineFieldCondition,
  timezone?: string,
): SQL | undefined {
  const stored = sql`(${pipelineItemModel.fieldValues} ->> ${fieldId})`
  if (condition.operator === "hasValue") {
    return sql`(${stored} is not null and ${stored} <> '')`
  }
  if (condition.operator === "noValue") {
    return sql`(${stored} is null or ${stored} = '')`
  }
  const kind = PIPELINE_FIELD_COMPARISON_KIND[fieldType]
  return FIELD_STRATEGY_BY_KIND[kind]({
    stored,
    condition,
    timezone: isKnownTimezone(timezone) ? timezone : FALLBACK_TIMEZONE,
  })
}
