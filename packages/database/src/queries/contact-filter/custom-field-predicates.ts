import { type SQL, sql } from "drizzle-orm"
import { type OperatorType, operatorTypes } from "../../partials"
import { contactCustomFieldModel } from "../../schema"
import { escapeLikePattern, likeContains } from "../../utils"
import { existsWhere } from "./exists"
import type { ContactWhere } from "./types"
import {
  DATETIME_VALUE_PATTERN,
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
  valueType?: string
}): ContactWhere {
  if (!condition.customFieldId) {
    return {}
  }
  const comparison = buildCustomFieldComparison(
    condition.operator,
    condition.value,
    condition.valueType,
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
  operator: string,
  value: unknown,
  valueType: string | undefined,
): CustomFieldComparison | undefined {
  const positiveOperator = NEGATION_TO_POSITIVE[operator as OperatorType]
  const negate = positiveOperator !== undefined
  const predicate = buildCustomFieldPositivePredicate(
    positiveOperator ?? operator,
    value,
    valueType,
  )
  return predicate ? { predicate, negate } : undefined
}

function buildCustomFieldPositivePredicate(
  operator: string,
  value: unknown,
  valueType: string | undefined,
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
    return buildDatetimeCustomFieldPredicate(operator, value, intervalValue)
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

function buildDatetimeCustomFieldPredicate(
  operator: string,
  value: unknown,
  intervalValue: IntervalValue | undefined,
): SQL | undefined {
  const column = contactCustomFieldModel.value
  const guard = sql`(${column} IS NOT NULL AND ${column} <> '' AND ${column} ~ ${DATETIME_VALUE_PATTERN})`
  const ts = sql`CASE WHEN ${guard} THEN NULLIF(${column}, '')::timestamptz END`

  if (operator === operatorTypes.enum.isBetween) {
    if (
      !(
        intervalValue &&
        isValidDateTimeFilterValue(intervalValue[0]) &&
        isValidDateTimeFilterValue(intervalValue[1])
      )
    ) {
      return
    }
    return sql`(${guard} AND ${ts} >= ${intervalValue[0]}::timestamptz AND ${ts} <= ${intervalValue[1]}::timestamptz)`
  }

  if (
    typeof value !== "string" ||
    value === "" ||
    !isValidDateTimeFilterValue(value)
  ) {
    return
  }

  const dayStart = sql`date_trunc('day', ${value}::timestamptz)`
  const dayEnd = sql`${dayStart} + INTERVAL '1 day'`

  switch (operator) {
    case operatorTypes.enum.eq:
      return sql`(${guard} AND ${ts} >= ${dayStart} AND ${ts} < ${dayEnd})`
    case operatorTypes.enum.gt:
      return sql`(${guard} AND ${ts} > ${value}::timestamptz)`
    case operatorTypes.enum.gte:
      return sql`(${guard} AND ${ts} >= ${value}::timestamptz)`
    case operatorTypes.enum.lt:
      return sql`(${guard} AND ${ts} < ${value}::timestamptz)`
    case operatorTypes.enum.lte:
      return sql`(${guard} AND ${ts} <= ${value}::timestamptz)`
    default:
      return
  }
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
