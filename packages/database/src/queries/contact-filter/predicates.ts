import { type AnyColumn, type SQL, sql } from "drizzle-orm"
import {
  type ContactInfoFilterValue,
  type ContactInfoType,
  contactInfoFilterValues,
  contactInfoTypes,
  operatorTypes,
} from "../../partials"
import { contactInboxModel, messageModel } from "../../schema"
import { escapeLikePattern, likeContains } from "../../utils"
import { contactInboxExists } from "./exists"
import { filterValueToUtcInstantWindow } from "./timezone"
import type { ContactWhere, RawTable, RelationExists } from "./types"
import {
  isValidDateTimeFilterValue,
  NUMERIC_VALUE_PATTERN,
} from "./value-format"

const NON_NEGATIVE_INTEGER_PATTERN = /^\d+$/

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

  const operatorValue = applyOperator(operator, value)
  if (operatorValue === undefined) {
    return {}
  }

  const condition = { [columnName]: operatorValue }
  return COLUMN_NEGATION_OPERATORS.has(operator)
    ? { OR: [condition, { [columnName]: { isNull: true } }] }
    : condition
}

/**
 * The precision-aware operator mapping shared by every built-in `timestamptz`
 * date field (real columns and MAX() aggregates alike), matching the datetime
 * custom-field convention in `custom-field-predicates.ts`. Each typed value
 * resolves to a half-open UTC window `[start, end)` whose width follows the
 * typed precision (day / minute / second), and every operator is derived from
 * that one window so they stay mutually consistent:
 *   eq  -> start <= v < end        (the whole typed unit)
 *   ne  -> v < start OR v >= end OR v IS NULL   (null-safe negation of eq)
 *   gt  -> v >= end                (strictly after the whole unit)
 *   gte -> v >= start              (at or after the unit begins)
 *   lt  -> v <  start              (strictly before the whole unit)
 *   lte -> v <  end                (at or before the whole unit ends)
 *   isBetween    -> loStart <= v < hiEnd
 *   notBetween   -> v < loStart OR v >= hiEnd OR v IS NULL
 * Returns a render closure over the comparison target (a column or an aggregate
 * SQL expression), or `undefined` when the value/operator is unusable so the
 * caller can drop the condition instead of emitting a false predicate.
 */
function resolveTimestamptzComparison(
  operator: string,
  value: unknown,
  timezone: string,
): ((target: SQL | AnyColumn) => SQL) | undefined {
  if (
    operator === operatorTypes.enum.isBetween ||
    operator === operatorTypes.enum.notBetween
  ) {
    const intervalValue = getDateIntervalValue(value)
    if (!intervalValue) {
      return
    }
    const loStart = filterValueToUtcInstantWindow(
      intervalValue[0],
      timezone,
    ).startIso
    const hiEnd = filterValueToUtcInstantWindow(
      intervalValue[1],
      timezone,
    ).endIso
    return operator === operatorTypes.enum.isBetween
      ? (target) =>
          sql`(${target} >= ${loStart}::timestamptz AND ${target} < ${hiEnd}::timestamptz)`
      : (target) =>
          sql`(${target} < ${loStart}::timestamptz OR ${target} >= ${hiEnd}::timestamptz OR ${target} IS NULL)`
  }

  if (
    typeof value !== "string" ||
    value === "" ||
    !isValidDateTimeFilterValue(value)
  ) {
    return
  }

  const { startIso, endIso } = filterValueToUtcInstantWindow(value, timezone)
  switch (operator) {
    case operatorTypes.enum.eq:
      return (target) =>
        sql`(${target} >= ${startIso}::timestamptz AND ${target} < ${endIso}::timestamptz)`
    case operatorTypes.enum.ne:
      return (target) =>
        sql`(${target} < ${startIso}::timestamptz OR ${target} >= ${endIso}::timestamptz OR ${target} IS NULL)`
    case operatorTypes.enum.gt:
      return (target) => sql`${target} >= ${endIso}::timestamptz`
    case operatorTypes.enum.gte:
      return (target) => sql`${target} >= ${startIso}::timestamptz`
    case operatorTypes.enum.lt:
      return (target) => sql`${target} < ${startIso}::timestamptz`
    case operatorTypes.enum.lte:
      return (target) => sql`${target} < ${endIso}::timestamptz`
    default:
      return
  }
}

export function buildDateColumnWhere(
  columnName: string,
  operator: string,
  value: unknown,
  timezone: string,
): ContactWhere {
  if (operator === operatorTypes.enum.isEmpty) {
    return { [columnName]: { isNull: true } }
  }
  if (operator === operatorTypes.enum.isNotEmpty) {
    return { [columnName]: { isNotNull: true } }
  }

  const render = resolveTimestamptzComparison(operator, value, timezone)
  return render ? buildRawColumnWhere(columnName, render) : {}
}

export function buildLatestContactInboxDateWhere(
  column: AnyColumn,
  operator: string,
  value: unknown,
  timezone: string,
): ContactWhere {
  return buildLatestContactInboxAggregateWhere(
    column,
    operator,
    value,
    (op, val, latest) =>
      buildDatetimeAggregateComparison(op, val, latest, timezone),
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

export function buildLatestContactInboxTextWhere(
  column: AnyColumn,
  operator: string,
  value: unknown,
): ContactWhere {
  const latestValue = sql.raw('"latestInteraction"."latest"')
  const comparison = buildTextValueComparison(operator, value, latestValue)
  if (!comparison) {
    return {}
  }

  return {
    RAW: (table: RawTable): SQL => sql`EXISTS (
      SELECT 1
      FROM (
        SELECT (
          SELECT ${column}
          FROM ${contactInboxModel}
          WHERE ${contactInboxModel.contactId} = ${table.id}
            AND ${contactInboxModel.lastIncomingMessageAt} IS NOT NULL
          ORDER BY ${contactInboxModel.lastIncomingMessageAt} DESC
          LIMIT 1
        ) AS "latest"
      ) AS "latestInteraction"
      WHERE ${comparison}
    )`,
  }
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

const CONTACT_INFO_COLUMN_NAMES = {
  phone: "phoneNumber",
  email: "email",
} as const satisfies Record<ContactInfoType, string>

/** `(column IS NOT NULL AND column <> '')` — NULL-safe both plain and negated. */
const contactInfoPresenceSQL = (
  table: RawTable,
  infoType: ContactInfoType,
): SQL => {
  const column = table[CONTACT_INFO_COLUMN_NAMES[infoType]]
  return sql`(${column} IS NOT NULL AND ${column} <> '')`
}

const orPredicatesSQL = (predicates: SQL[]): SQL =>
  sql`(${sql.join(predicates, sql` OR `)})`

const hasAnyContactInfoSQL = (
  table: RawTable,
  infoTypes: readonly ContactInfoType[],
): SQL =>
  orPredicatesSQL(
    infoTypes.map((infoType) => contactInfoPresenceSQL(table, infoType)),
  )

/**
 * Presence predicate for one `hasContactInfo` filter value. The `phoneAndEmail`
 * composite requires BOTH columns; atomic values require just their own.
 */
const contactInfoFilterValueSQL = (
  table: RawTable,
  value: ContactInfoFilterValue,
): SQL =>
  value === contactInfoFilterValues.enum.phoneAndEmail
    ? sql`(${contactInfoPresenceSQL(table, "phone")} AND ${contactInfoPresenceSQL(table, "email")})`
    : contactInfoPresenceSQL(table, value)

const matchesAnyContactInfoValueSQL = (
  table: RawTable,
  values: readonly ContactInfoFilterValue[],
): SQL =>
  orPredicatesSQL(
    values.map((value) => contactInfoFilterValueSQL(table, value)),
  )

const parseContactInfoFilterValues = (
  value: unknown,
): ContactInfoFilterValue[] => {
  const rawValues = Array.isArray(value) ? value : [value]
  const parsed = contactInfoFilterValues.array().safeParse(rawValues)
  return parsed.success ? [...new Set(parsed.data)] : []
}

export function buildHasContactInfoWhere(
  operator: string,
  value: unknown,
): ContactWhere {
  if (operator === operatorTypes.enum.isEmpty) {
    return {
      RAW: (table: RawTable): SQL =>
        sql`NOT ${hasAnyContactInfoSQL(table, contactInfoTypes.options)}`,
    }
  }

  const selectedValues = parseContactInfoFilterValues(value)
  if (selectedValues.length === 0) {
    return {}
  }

  if (operator === operatorTypes.enum.in) {
    return {
      RAW: (table: RawTable): SQL =>
        matchesAnyContactInfoValueSQL(table, selectedValues),
    }
  }

  if (operator === operatorTypes.enum.notIn) {
    return {
      RAW: (table: RawTable): SQL =>
        sql`NOT ${matchesAnyContactInfoValueSQL(table, selectedValues)}`,
    }
  }

  return {}
}

export function buildExistingContactWhere(
  operator: string,
  value: unknown,
): ContactWhere {
  const hasEmailOrPhone = (table: RawTable): SQL =>
    hasAnyContactInfoSQL(table, contactInfoTypes.options)

  if (operator === operatorTypes.enum.eq) {
    return {
      RAW: (table: RawTable): SQL =>
        value === "true"
          ? hasEmailOrPhone(table)
          : sql`NOT ${hasEmailOrPhone(table)}`,
    }
  }

  if (operator === operatorTypes.enum.isEmpty) {
    return {
      RAW: (table: RawTable): SQL => sql`NOT ${hasEmailOrPhone(table)}`,
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
  timezone: string,
): SQL | undefined {
  if (operator === operatorTypes.enum.isEmpty) {
    return sql`${latestValue} IS NULL`
  }
  if (operator === operatorTypes.enum.isNotEmpty) {
    return sql`${latestValue} IS NOT NULL`
  }

  // Same precision-aware window mapping as the real-column path; the only
  // difference is that the comparison target is the MAX() aggregate expression.
  return resolveTimestamptzComparison(operator, value, timezone)?.(latestValue)
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

function buildTextValueComparison(
  operator: string,
  value: unknown,
  latestValue: SQL,
): SQL | undefined {
  const textExpression = sql`${latestValue}::text`

  if (operator === operatorTypes.enum.isEmpty) {
    return sql`(${latestValue} IS NULL OR ${textExpression} = '')`
  }
  if (operator === operatorTypes.enum.isNotEmpty) {
    return sql`(${latestValue} IS NOT NULL AND ${textExpression} <> '')`
  }

  if (typeof value !== "string" || value === "") {
    return
  }

  if (operator === operatorTypes.enum.eq) {
    return sql`${textExpression} ILIKE ${escapeLikePattern(value)}`
  }
  if (operator === operatorTypes.enum.ne) {
    return sql`(${textExpression} NOT ILIKE ${escapeLikePattern(value)} OR ${latestValue} IS NULL)`
  }

  return buildTextSearchComparison(
    operator,
    value,
    textExpression,
    sql`${latestValue} IS NULL OR ${textExpression} = ''`,
  )
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
      return
  }
}
