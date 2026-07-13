import { type AnyColumn, type SQL, sql } from "drizzle-orm"
import { operatorTypes } from "../../partials"
import { contactInboxModel, messageModel } from "../../schema"
import { escapeLikePattern, likeContains } from "../../utils"
import { contactInboxExists } from "./exists"
import type { ContactWhere, RawTable, RelationExists } from "./types"

const NUMERIC_VALUE_PATTERN = /^-?\d+(\.\d+)?$/
const NON_NEGATIVE_INTEGER_PATTERN = /^\d+$/
const DATETIME_VALUE_PATTERN =
  "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])([T ]([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d(\\.\\d{1,6})?)?(Z|[+-]([01]\\d|2[0-3]):?[0-5]\\d)?)?$"
const DATETIME_VALUE_RE = new RegExp(DATETIME_VALUE_PATTERN)

const isValidDateTimeFilterValue = (value: string): boolean =>
  DATETIME_VALUE_RE.test(value) && !Number.isNaN(Date.parse(value))

const COLUMN_NEGATION_OPERATORS = new Set<string>([
  operatorTypes.enum.ne,
  operatorTypes.enum.notIn,
  operatorTypes.enum.notContains,
])

export const contactInboxInteractedWithin24hSQL = (): SQL =>
  sql`${contactInboxModel.lastIncomingMessageAt} >= NOW() - INTERVAL '24 hours'`

export const buildRawColumnWhere = (
  columnName: string,
  comparison: (column: AnyColumn) => SQL,
): ContactWhere => ({
  RAW: (table: RawTable): SQL => comparison(table[columnName]),
})

export function buildColumnWhere(
  columnName: string,
  operator: string,
  value: unknown,
  options?: { caseInsensitiveEquality?: boolean },
): ContactWhere {
  if (
    typeof value === "string" &&
    value !== "" &&
    options?.caseInsensitiveEquality &&
    operator === operatorTypes.enum.eq
  ) {
    return buildRawColumnWhere(
      columnName,
      (column) => sql`${column} ILIKE ${escapeLikePattern(value)}`,
    )
  }

  if (
    typeof value === "string" &&
    value !== "" &&
    options?.caseInsensitiveEquality &&
    operator === operatorTypes.enum.ne
  ) {
    const condition = buildRawColumnWhere(
      columnName,
      (column) => sql`${column} NOT ILIKE ${escapeLikePattern(value)}`,
    )

    return {
      OR: [condition, { [columnName]: { isNull: true } }],
    }
  }

  if (
    typeof value === "string" &&
    value !== "" &&
    operator === operatorTypes.enum.startsWith
  ) {
    const escapedValue = escapeLikePattern(value)
    return buildRawColumnWhere(
      columnName,
      (column) => sql`${column} ILIKE ${`${escapedValue}%`}`,
    )
  }

  if (
    typeof value === "string" &&
    value !== "" &&
    operator === operatorTypes.enum.endsWith
  ) {
    const escapedValue = escapeLikePattern(value)
    return buildRawColumnWhere(
      columnName,
      (column) => sql`${column} ILIKE ${`%${escapedValue}`}`,
    )
  }

  if (operator === operatorTypes.enum.isEmpty) {
    if (columnName === "gender") {
      return { [columnName]: { isNull: true } }
    }

    return {
      OR: [{ [columnName]: { isNull: true } }, { [columnName]: "" }],
    }
  }

  if (operator === operatorTypes.enum.isNotEmpty) {
    if (columnName === "gender") {
      return { [columnName]: { isNotNull: true } }
    }

    return {
      AND: [
        { [columnName]: { isNotNull: true } },
        { [columnName]: { ne: "" } },
      ],
    }
  }

  if (
    operator === operatorTypes.enum.isBetween ||
    operator === operatorTypes.enum.notBetween
  ) {
    return {}
  }

  const condition = { [columnName]: applyOperator(operator, value) }
  return COLUMN_NEGATION_OPERATORS.has(operator)
    ? { OR: [condition, { [columnName]: { isNull: true } }] }
    : condition
}

export function buildDateColumnWhere(
  columnName: string,
  operator: string,
  value: unknown,
): ContactWhere {
  if (operator === operatorTypes.enum.isEmpty) {
    return { [columnName]: { isNull: true } }
  }
  if (operator === operatorTypes.enum.isNotEmpty) {
    return { [columnName]: { isNotNull: true } }
  }

  const intervalValue = getDateIntervalValue(value)

  if (
    operator === operatorTypes.enum.isBetween ||
    operator === operatorTypes.enum.notBetween
  ) {
    if (!intervalValue) {
      return {}
    }

    return buildRawColumnWhere(columnName, (column) =>
      operator === operatorTypes.enum.isBetween
        ? sql`(${column} >= ${intervalValue[0]}::timestamptz AND ${column} <= ${intervalValue[1]}::timestamptz)`
        : sql`(${column} < ${intervalValue[0]}::timestamptz OR ${column} > ${intervalValue[1]}::timestamptz OR ${column} IS NULL)`,
    )
  }

  if (
    typeof value !== "string" ||
    value === "" ||
    !isValidDateTimeFilterValue(value)
  ) {
    return {}
  }

  if (operator === operatorTypes.enum.eq) {
    return buildRawColumnWhere(columnName, (column) => {
      const dayStart = sql`date_trunc('day', ${value}::timestamptz)`
      const dayEnd = sql`${dayStart} + INTERVAL '1 day'`
      return sql`(${column} >= ${dayStart} AND ${column} < ${dayEnd})`
    })
  }

  if (operator === operatorTypes.enum.ne) {
    return buildRawColumnWhere(columnName, (column) => {
      const dayStart = sql`date_trunc('day', ${value}::timestamptz)`
      const dayEnd = sql`${dayStart} + INTERVAL '1 day'`
      return sql`(${column} < ${dayStart} OR ${column} >= ${dayEnd} OR ${column} IS NULL)`
    })
  }

  switch (operator) {
    case operatorTypes.enum.gt:
      return buildRawColumnWhere(
        columnName,
        (column) => sql`${column} > ${value}::timestamptz`,
      )
    case operatorTypes.enum.gte:
      return buildRawColumnWhere(
        columnName,
        (column) => sql`${column} >= ${value}::timestamptz`,
      )
    case operatorTypes.enum.lt:
      return buildRawColumnWhere(
        columnName,
        (column) => sql`${column} < ${value}::timestamptz`,
      )
    case operatorTypes.enum.lte:
      return buildRawColumnWhere(
        columnName,
        (column) => sql`${column} <= ${value}::timestamptz`,
      )
    default:
      return {}
  }
}

export function buildLatestContactInboxDateWhere(
  column: AnyColumn,
  operator: string,
  value: unknown,
): ContactWhere {
  return buildLatestContactInboxAggregateWhere(
    column,
    operator,
    value,
    buildDatetimeAggregateComparison,
  )
}

export function buildLatestContactInboxNumberWhere(
  column: AnyColumn,
  operator: string,
  value: unknown,
): ContactWhere {
  return buildLatestContactInboxAggregateWhere(
    column,
    operator,
    value,
    buildNumberAggregateComparison,
  )
}

export function buildLatestContactInboxMinutesAgoWhere(
  column: AnyColumn,
  operator: string,
  value: unknown,
): ContactWhere {
  return buildLatestContactInboxAggregateWhere(
    column,
    operator,
    value,
    buildMinutesAgoComparison,
  )
}

export function buildMinutesAgoWhere(
  columnName: string,
  operator: string,
  value: unknown,
): ContactWhere {
  if (!canBuildMinutesAgoComparison(operator, value)) {
    return {}
  }

  return buildRawColumnWhere(columnName, (column) => {
    const comparison = buildMinutesAgoComparison(operator, value, column)
    return comparison ?? sql`FALSE`
  })
}

type AggregateComparisonBuilder = (
  operator: string,
  value: unknown,
  latestValue: SQL,
) => SQL | undefined

function buildLatestContactInboxAggregateWhere(
  column: AnyColumn,
  operator: string,
  value: unknown,
  buildComparison: AggregateComparisonBuilder,
): ContactWhere {
  const latestValue = sql.raw('"latestInteraction"."latest"')
  const comparison = buildComparison(operator, value, latestValue)
  if (!comparison) {
    return {}
  }

  return {
    RAW: (table: RawTable): SQL => sql`EXISTS (
      SELECT 1
      FROM (
        SELECT MAX(${column}) AS "latest"
        FROM ${contactInboxModel}
        WHERE ${contactInboxModel.contactId} = ${table.id}
      ) AS "latestInteraction"
      WHERE ${comparison}
    )`,
  }
}

export function buildBooleanFromTimestamp(
  column: string,
  operator: string,
  value: unknown,
): ContactWhere {
  if (operator === operatorTypes.enum.isEmpty) {
    return { [column]: { isNull: true } }
  }
  if (operator === operatorTypes.enum.isNotEmpty) {
    return { [column]: { isNotNull: true } }
  }
  if (operator === operatorTypes.enum.eq) {
    return value === "true"
      ? { [column]: { isNotNull: true } }
      : { [column]: { isNull: true } }
  }
  return {}
}

export function buildBooleanColumn(
  column: string,
  operator: string,
  value: unknown,
): ContactWhere {
  if (operator === operatorTypes.enum.isEmpty) {
    return { [column]: { isNull: true } }
  }
  if (operator === operatorTypes.enum.eq) {
    return { [column]: value === "true" }
  }
  return {}
}

export function buildExistingContactWhere(
  operator: string,
  value: unknown,
): ContactWhere {
  const hasEmailOrPhone = (table: RawTable): SQL =>
    sql`((${table.email} IS NOT NULL AND ${table.email} <> '') OR (${table.phoneNumber} IS NOT NULL AND ${table.phoneNumber} <> ''))`

  if (operator === operatorTypes.enum.eq) {
    return {
      RAW: (table: RawTable): SQL =>
        value === "true"
          ? hasEmailOrPhone(table)
          : sql`NOT (${hasEmailOrPhone(table)})`,
    }
  }

  if (operator === operatorTypes.enum.isEmpty) {
    return {
      RAW: (table: RawTable): SQL => sql`NOT (${hasEmailOrPhone(table)})`,
    }
  }

  return {}
}

export function buildExistsBooleanWhere(
  exists: RelationExists,
  yesPredicate: SQL,
  operator: string,
  value: unknown,
): ContactWhere {
  const isYes =
    (operator === operatorTypes.enum.eq && value === "true") ||
    operator === operatorTypes.enum.isNotEmpty
  const isNo =
    (operator === operatorTypes.enum.eq && value !== "true") ||
    operator === operatorTypes.enum.isEmpty
  if (!(isYes || isNo)) {
    return {}
  }
  return exists(yesPredicate, isNo)
}

export function buildLastCommentWhere(
  operator: string,
  value: unknown,
): ContactWhere {
  if (operator === operatorTypes.enum.isEmpty) {
    return contactInboxExists(
      sql`${contactInboxModel.lastCommentMessageId} IS NOT NULL`,
      true,
    )
  }

  if (operator === operatorTypes.enum.isNotEmpty) {
    return contactInboxExists(
      sql`${contactInboxModel.lastCommentMessageId} IS NOT NULL`,
      false,
    )
  }

  if (typeof value !== "string" || value === "") {
    return {}
  }

  const messageTextPredicate = buildLastCommentTextPredicate(operator, value)
  if (!messageTextPredicate) {
    return {}
  }

  const commentPredicate = sql`${contactInboxModel.lastCommentMessageId} ~ '^[0-9]+$' AND EXISTS (
    SELECT 1
    FROM ${messageModel}
    WHERE ${messageModel.id} = CASE
      WHEN ${contactInboxModel.lastCommentMessageId} ~ '^[0-9]+$'
      THEN ${contactInboxModel.lastCommentMessageId}::bigint
    END
      AND ${messageTextPredicate}
  )`

  const shouldNegate =
    operator === operatorTypes.enum.ne ||
    operator === operatorTypes.enum.notContains

  return contactInboxExists(commentPredicate, shouldNegate)
}

function buildDatetimeAggregateComparison(
  operator: string,
  value: unknown,
  latestValue: SQL,
): SQL | undefined {
  if (operator === operatorTypes.enum.isEmpty) {
    return sql`${latestValue} IS NULL`
  }
  if (operator === operatorTypes.enum.isNotEmpty) {
    return sql`${latestValue} IS NOT NULL`
  }

  const intervalValue = getDateIntervalValue(value)

  if (
    operator === operatorTypes.enum.isBetween ||
    operator === operatorTypes.enum.notBetween
  ) {
    if (!intervalValue) {
      return
    }

    return operator === operatorTypes.enum.isBetween
      ? sql`(${latestValue} >= ${intervalValue[0]}::timestamptz AND ${latestValue} <= ${intervalValue[1]}::timestamptz)`
      : sql`(${latestValue} < ${intervalValue[0]}::timestamptz OR ${latestValue} > ${intervalValue[1]}::timestamptz OR ${latestValue} IS NULL)`
  }

  if (
    typeof value !== "string" ||
    value === "" ||
    !isValidDateTimeFilterValue(value)
  ) {
    return
  }

  if (
    operator === operatorTypes.enum.eq ||
    operator === operatorTypes.enum.ne
  ) {
    const dayStart = sql`date_trunc('day', ${value}::timestamptz)`
    const dayEnd = sql`${dayStart} + INTERVAL '1 day'`
    return operator === operatorTypes.enum.eq
      ? sql`(${latestValue} >= ${dayStart} AND ${latestValue} < ${dayEnd})`
      : sql`(${latestValue} < ${dayStart} OR ${latestValue} >= ${dayEnd} OR ${latestValue} IS NULL)`
  }

  switch (operator) {
    case operatorTypes.enum.gt:
      return sql`${latestValue} > ${value}::timestamptz`
    case operatorTypes.enum.gte:
      return sql`${latestValue} >= ${value}::timestamptz`
    case operatorTypes.enum.lt:
      return sql`${latestValue} < ${value}::timestamptz`
    case operatorTypes.enum.lte:
      return sql`${latestValue} <= ${value}::timestamptz`
    default:
      return
  }
}

function buildNumberAggregateComparison(
  operator: string,
  value: unknown,
  latestValue: SQL,
): SQL | undefined {
  if (operator === operatorTypes.enum.isEmpty) {
    return sql`${latestValue} IS NULL`
  }
  if (operator === operatorTypes.enum.isNotEmpty) {
    return sql`${latestValue} IS NOT NULL`
  }

  const intervalValue = getCustomFieldIntervalValue(value)
  if (
    operator === operatorTypes.enum.isBetween ||
    operator === operatorTypes.enum.notBetween
  ) {
    if (
      !(
        intervalValue &&
        NUMERIC_VALUE_PATTERN.test(intervalValue[0]) &&
        NUMERIC_VALUE_PATTERN.test(intervalValue[1])
      )
    ) {
      return
    }

    const start = Number(intervalValue[0])
    const end = Number(intervalValue[1])
    return operator === operatorTypes.enum.isBetween
      ? sql`(${latestValue} >= ${start} AND ${latestValue} <= ${end})`
      : sql`(${latestValue} < ${start} OR ${latestValue} > ${end} OR ${latestValue} IS NULL)`
  }

  if (typeof value !== "string" || value === "") {
    return
  }

  const textComparison = buildTextSearchComparison(
    operator,
    value,
    sql`${latestValue}::text`,
    sql`${latestValue} IS NULL`,
  )
  if (textComparison) {
    return textComparison
  }

  if (!NUMERIC_VALUE_PATTERN.test(value)) {
    return
  }

  const n = Number(value)
  switch (operator) {
    case operatorTypes.enum.eq:
      return sql`${latestValue} = ${n}`
    case operatorTypes.enum.ne:
      return sql`(${latestValue} <> ${n} OR ${latestValue} IS NULL)`
    case operatorTypes.enum.gt:
      return sql`${latestValue} > ${n}`
    case operatorTypes.enum.gte:
      return sql`${latestValue} >= ${n}`
    case operatorTypes.enum.lt:
      return sql`${latestValue} < ${n}`
    case operatorTypes.enum.lte:
      return sql`${latestValue} <= ${n}`
    default:
      return
  }
}

function buildMinutesAgoComparison(
  operator: string,
  value: unknown,
  column: AnyColumn | SQL,
): SQL | undefined {
  if (operator === operatorTypes.enum.isEmpty) {
    return sql`${column} IS NULL`
  }
  if (operator === operatorTypes.enum.isNotEmpty) {
    return sql`${column} IS NOT NULL`
  }

  const intervalValue = getCustomFieldIntervalValue(value)
  if (
    operator === operatorTypes.enum.isBetween ||
    operator === operatorTypes.enum.notBetween
  ) {
    if (
      !(
        intervalValue &&
        isNonNegativeInteger(intervalValue[0]) &&
        isNonNegativeInteger(intervalValue[1])
      )
    ) {
      return
    }

    const startMinutes = Number(intervalValue[0])
    const endMinutes = Number(intervalValue[1])
    const olderBoundary = Math.max(startMinutes, endMinutes)
    const newerBoundary = Math.min(startMinutes, endMinutes)
    const between = sql`(${column} >= NOW() - make_interval(mins => ${olderBoundary}) AND ${column} <= NOW() - make_interval(mins => ${newerBoundary}))`
    return operator === operatorTypes.enum.isBetween
      ? between
      : sql`(NOT ${between} OR ${column} IS NULL)`
  }

  if (typeof value !== "string" || value === "") {
    return
  }

  const textComparison = buildTextSearchComparison(
    operator,
    value,
    sql`FLOOR(EXTRACT(EPOCH FROM (NOW() - ${column})) / 60)::text`,
    sql`${column} IS NULL`,
  )
  if (textComparison) {
    return textComparison
  }

  if (!isNonNegativeInteger(value)) {
    return
  }

  const minutes = Number(value)
  switch (operator) {
    case operatorTypes.enum.gt:
      return sql`${column} < NOW() - make_interval(mins => ${minutes})`
    case operatorTypes.enum.gte:
      return sql`${column} <= NOW() - make_interval(mins => ${minutes})`
    case operatorTypes.enum.lt:
      return sql`${column} > NOW() - make_interval(mins => ${minutes})`
    case operatorTypes.enum.lte:
      return sql`${column} >= NOW() - make_interval(mins => ${minutes})`
    case operatorTypes.enum.eq:
      return sql`(${column} <= NOW() - make_interval(mins => ${minutes}) AND ${column} > NOW() - make_interval(mins => ${minutes + 1}))`
    case operatorTypes.enum.ne: {
      const equalWindow = sql`(${column} <= NOW() - make_interval(mins => ${minutes}) AND ${column} > NOW() - make_interval(mins => ${minutes + 1}))`
      return sql`(NOT ${equalWindow} OR ${column} IS NULL)`
    }
    default:
      return
  }
}

function canBuildMinutesAgoComparison(
  operator: string,
  value: unknown,
): boolean {
  if (
    operator === operatorTypes.enum.isEmpty ||
    operator === operatorTypes.enum.isNotEmpty
  ) {
    return true
  }

  if (
    operator === operatorTypes.enum.isBetween ||
    operator === operatorTypes.enum.notBetween
  ) {
    const intervalValue = getCustomFieldIntervalValue(value)
    return Boolean(
      intervalValue &&
        isNonNegativeInteger(intervalValue[0]) &&
        isNonNegativeInteger(intervalValue[1]),
    )
  }

  if (typeof value !== "string" || value === "") {
    return false
  }

  if (isTextSearchOperator(operator)) {
    return true
  }

  return isNonNegativeInteger(value)
}

export function buildTextSearchComparison(
  operator: string,
  value: string,
  textExpression: SQL,
  emptyPredicate: SQL,
): SQL | undefined {
  switch (operator) {
    case operatorTypes.enum.contains:
      return sql`${textExpression} ILIKE ${likeContains(value)}`
    case operatorTypes.enum.notContains:
      return sql`(${textExpression} NOT ILIKE ${likeContains(value)} OR ${emptyPredicate})`
    case operatorTypes.enum.startsWith:
      return sql`${textExpression} ILIKE ${`${escapeLikePattern(value)}%`}`
    case operatorTypes.enum.endsWith:
      return sql`${textExpression} ILIKE ${`%${escapeLikePattern(value)}`}`
    default:
      return
  }
}

function buildLastCommentTextPredicate(
  operator: string,
  value: string,
): SQL | undefined {
  const textExpression = sql`${messageModel.text}`
  const emptyPredicate = sql`${messageModel.text} IS NULL OR ${messageModel.text} = ''`

  switch (operator) {
    // eq/ne both build the positive (case-insensitive equality) predicate; the
    // caller applies NOT EXISTS for ne, so the SQL here is intentionally shared.
    case operatorTypes.enum.eq:
    case operatorTypes.enum.ne:
      return sql`${textExpression} ILIKE ${escapeLikePattern(value)}`
    // notContains builds the positive "contains" predicate; negation is applied
    // by the caller's NOT EXISTS.
    case operatorTypes.enum.notContains:
      return buildTextSearchComparison(
        operatorTypes.enum.contains,
        value,
        textExpression,
        emptyPredicate,
      )
    default:
      return buildTextSearchComparison(
        operator,
        value,
        textExpression,
        emptyPredicate,
      )
  }
}

function isTextSearchOperator(operator: string): boolean {
  return (
    operator === operatorTypes.enum.contains ||
    operator === operatorTypes.enum.notContains ||
    operator === operatorTypes.enum.startsWith ||
    operator === operatorTypes.enum.endsWith
  )
}

type IntervalValue = [string, string]

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

function getDateIntervalValue(value: unknown): IntervalValue | undefined {
  return Array.isArray(value) &&
    typeof value[0] === "string" &&
    typeof value[1] === "string" &&
    isValidDateTimeFilterValue(value[0]) &&
    isValidDateTimeFilterValue(value[1])
    ? [value[0], value[1]]
    : undefined
}

function isNonNegativeInteger(value: string): boolean {
  return NON_NEGATIVE_INTEGER_PATTERN.test(value)
}

function applyOperator(operator: string, value: unknown): unknown {
  switch (operator) {
    case operatorTypes.enum.eq:
      if (Array.isArray(value)) {
        return { in: value }
      }
      return value
    case operatorTypes.enum.ne:
      if (Array.isArray(value)) {
        return { notIn: value }
      }
      return { ne: value }
    case operatorTypes.enum.in:
      return { in: value }
    case operatorTypes.enum.notIn:
      return { notIn: value }
    case operatorTypes.enum.isEmpty:
      return { isNull: true }
    case operatorTypes.enum.isNotEmpty:
      return { isNotNull: true }
    case operatorTypes.enum.contains:
      return { ilike: likeContains(String(value)) }
    case operatorTypes.enum.notContains:
      return { notIlike: likeContains(String(value)) }
    case operatorTypes.enum.lt:
      return { lt: value }
    case operatorTypes.enum.lte:
      return { lte: value }
    case operatorTypes.enum.gt:
      return { gt: value }
    case operatorTypes.enum.gte:
      return { gte: value }
    default:
      return value
  }
}
