import {
  type AnyColumn,
  inArray,
  relationsFilterToSQL,
  type SQL,
  sql,
} from "drizzle-orm"
import { type OperatorType, operatorTypes } from "../partials"
import {
  contactCustomFieldModel,
  contactInboxModel,
  contactModel,
  contactsToTagsModel,
  conversationModel,
} from "../schema"

export type ContactFilterConditionInput = {
  field: string
  operator: string
  value?: unknown
  /** Present for dynamic custom-field conditions (`field === "customField"`). */
  customFieldId?: string
  /** Form/value-input type of the custom field, used to cast the text value. */
  valueType?: string
}

/**
 * `conditions` is typed `unknown[]` because the builder's Zod schema uses a
 * discriminated union with a `@ts-expect-error`, which degrades its inferred
 * element type. Each entry is validated by Zod at the request boundary, so it
 * is safely narrowed to {@link ContactFilterConditionInput} inside this module.
 */
export type ContactFilterCriteriaInput = {
  operator: "and" | "or"
  conditions: unknown[]
}

type ContactWhere = Record<string, unknown>

export type ContactWhereInput = {
  workspaceId: string
  keyword?: string | null
  contactFilter?: ContactFilterCriteriaInput
}

const hasWhereParts = (where: ContactWhere): boolean =>
  Object.keys(where).length > 0

const escapeLikePattern = (value: string): string =>
  value.replace(/[\\%_]/g, "\\$&")

// ── Relation conditions as correlated EXISTS subqueries ─────────────────────────
// `relationsFilterToSQL` (used by the count / broadcast-audience / export paths)
// does NOT understand nested relation filter fields (`contactInboxes`, `tags`,
// `conversation`) — only columns, logical operators and `RAW`. So relation
// conditions must render as `RAW` EXISTS subqueries correlated on the contact id;
// this form works in both the relational query builder and `relationsFilterToSQL`.

const existsWhere = (
  buildSelect: (contactId: AnyColumn) => SQL,
  negate = false,
): ContactWhere => ({
  RAW: (table: Record<string, AnyColumn>): SQL => {
    const inner = buildSelect(table.id)
    return negate ? sql`NOT EXISTS (${inner})` : sql`EXISTS (${inner})`
  },
})

const contactInboxExists = (
  predicate: SQL | undefined,
  negate = false,
): ContactWhere =>
  existsWhere(
    (contactId) =>
      predicate
        ? sql`SELECT 1 FROM ${contactInboxModel} WHERE ${contactInboxModel.contactId} = ${contactId} AND ${predicate}`
        : sql`SELECT 1 FROM ${contactInboxModel} WHERE ${contactInboxModel.contactId} = ${contactId}`,
    negate,
  )

const tagsExists = (predicate: SQL | undefined, negate = false): ContactWhere =>
  existsWhere(
    (contactId) =>
      predicate
        ? sql`SELECT 1 FROM ${contactsToTagsModel} WHERE ${contactsToTagsModel.contactId} = ${contactId} AND ${predicate}`
        : sql`SELECT 1 FROM ${contactsToTagsModel} WHERE ${contactsToTagsModel.contactId} = ${contactId}`,
    negate,
  )

const conversationExists = (predicate: SQL, negate = false): ContactWhere =>
  existsWhere(
    (contactId) =>
      sql`SELECT 1 FROM ${conversationModel} WHERE ${conversationModel.contactId} = ${contactId} AND ${predicate}`,
    negate,
  )

const toArrayValue = (value: unknown): string[] =>
  Array.isArray(value) ? (value as string[]) : [value as string]

const RELATION_SET_OPERATORS = new Set<string>([
  operatorTypes.enum.in,
  operatorTypes.enum.notIn,
  operatorTypes.enum.eq,
  operatorTypes.enum.ne,
  operatorTypes.enum.isEmpty,
])

type RelationSetFilter = {
  exists: (predicate: SQL | undefined, negate?: boolean) => ContactWhere
  column: AnyColumn
}

const RELATION_SET_FILTERS: Record<string, RelationSetFilter> = {
  source: { exists: contactInboxExists, column: contactInboxModel.source },
  currentChannel: {
    exists: contactInboxExists,
    column: contactInboxModel.channel,
  },
  inbox: { exists: contactInboxExists, column: contactInboxModel.inboxId },
  tags: { exists: tagsExists, column: contactsToTagsModel.tagId },
}

const buildKeywordWhere = (keyword: string): ContactWhere => {
  const normalizedKeyword = `%${escapeLikePattern(keyword.toLowerCase())}%`

  return {
    OR: [
      { firstName: { ilike: normalizedKeyword } },
      { lastName: { ilike: normalizedKeyword } },
      { email: { ilike: normalizedKeyword } },
      { phoneNumber: { ilike: normalizedKeyword } },
    ],
  }
}

export function buildContactWhere(input: ContactWhereInput): ContactWhere {
  const where: ContactWhere = {
    workspaceId: input.workspaceId,
  }

  const filters = [
    input.keyword ? buildKeywordWhere(input.keyword) : undefined,
    input.contactFilter ? applyContactFilter(input.contactFilter) : undefined,
  ].filter((filter): filter is ContactWhere =>
    filter ? hasWhereParts(filter) : false,
  )

  if (filters.length === 1) {
    return {
      ...where,
      ...filters[0],
    }
  }

  if (filters.length > 1) {
    return {
      ...where,
      AND: filters,
    }
  }

  return where
}

export const buildContactInboxContactFilterSQL = ({
  contactIdColumn,
  workspaceId,
  contactFilter,
}: {
  contactIdColumn: AnyColumn
  workspaceId: string
  contactFilter: ContactFilterCriteriaInput
}): SQL => {
  if (contactFilter.conditions.length === 0) {
    return sql`TRUE`
  }

  const contactWhere = buildContactWhere({
    workspaceId,
    contactFilter,
  })
  const contactWhereSQL = relationsFilterToSQL(
    contactModel,
    contactWhere as never,
  )
  if (!contactWhereSQL) {
    return sql`TRUE`
  }

  return sql`${contactIdColumn} IN (SELECT ${contactModel.id} FROM ${contactModel} WHERE ${contactWhereSQL})`
}

// Shared 24h incoming-message window (Meta non-template rule) — same SQL, two scopes:
// - ContactInbox query root (broadcast audience / count): gates the current inbox row
// - inside a contact filter: wrapped by contactInboxExists → any inbox within 24h
export const contactInboxInteractedWithin24hSQL = (): SQL =>
  sql`${contactInboxModel.lastIncomingMessageAt} >= NOW() - INTERVAL '24 hours'`

/**
 * Maps a contact filter criteria to a Drizzle relational `where` object for
 * ContactModel. Shared between the builder app (contact list) and the worker
 * (contact export) so both resolve the same contacts for a given filter.
 *
 * Handles:
 *  - Direct columns (fullName, email, gender, country, locale, timezone)
 *  - Column aliases (phone → phoneNumber, contactCreatedAt → createdAt)
 *  - Boolean-from-timestamp (subscribedToBroadcast → broadcastSubscribedAt, blocked → blockedAt)
 *  - ContactInbox timestamps (lastInteraction → latest incoming message,
 *    interactedInLast24h → incoming message within the last 24 hours)
 *  - Relation sets (tags, source / currentChannel / inbox) as correlated EXISTS
 *  - Conversation booleans (archived, followUp, transferred-to-human) as EXISTS
 *
 * Fields that require complex SQL and are not yet implemented produce no condition.
 */
export function applyContactFilter(
  criteria: ContactFilterCriteriaInput,
): ContactWhere {
  const conditions = criteria.conditions as ContactFilterConditionInput[]
  if (conditions.length === 0) {
    return {}
  }

  const conditionWheres = conditions
    .map(buildConditionWhere)
    .filter((w): w is ContactWhere => Object.keys(w).length > 0)

  if (conditionWheres.length === 0) {
    return {}
  }

  if (criteria.operator === "or") {
    return { OR: conditionWheres }
  }

  return { AND: conditionWheres }
}

function buildConditionWhere(
  condition: ContactFilterConditionInput,
): ContactWhere {
  const { field, operator, value } = condition

  switch (field) {
    // ── Direct contact columns ────────────────────────────────────────────────
    case "fullName":
    case "email":
    case "gender":
    case "country":
    case "locale":
    case "timezone":
      return buildColumnWhere(field, operator, value)

    // ── Column aliases ────────────────────────────────────────────────────────
    case "phone":
      return buildColumnWhere("phoneNumber", operator, value)

    case "contactCreatedAt":
      return buildDateColumnWhere("createdAt", operator, value)

    case "lastSeen":
      return buildDateColumnWhere("lastReadAt", operator, value)

    case "lastInteraction":
      return buildLatestContactInboxDateWhere(
        contactInboxModel.lastIncomingMessageAt,
        operator,
        value,
      )

    // ── Direct boolean columns ────────────────────────────────────────────────
    case "emailWasVerified":
      return buildBooleanColumn("emailVerified", operator, value)

    case "optedInForEmail":
      return buildBooleanColumn("emailOptIn", operator, value)

    // ── Boolean-from-timestamp ────────────────────────────────────────────────
    case "subscribedToBroadcast":
      return buildBooleanFromTimestamp("broadcastSubscribedAt", operator, value)

    case "blocked":
      return buildBooleanFromTimestamp("blockedAt", operator, value)

    // ── Computed time-based boolean ───────────────────────────────────────────
    case "interactedInLast24h":
      return buildExistsBooleanWhere(
        contactInboxExists,
        contactInboxInteractedWithin24hSQL(),
        operator,
        value,
      )

    // ── Relation set fields ──────────────────────────────────────────────────
    case "tags":
    case "source":
    case "currentChannel":
    case "inbox":
      return buildRelationSetWhere(field, operator, value)

    // ── Dynamic custom field (value match on contactCustomFields) ─────────────
    case "customField": {
      const customFieldId = condition.customFieldId
      if (!customFieldId) {
        return {}
      }
      const comparison = buildCustomFieldComparison(
        operator,
        value,
        condition.valueType,
      )
      if (!comparison) {
        return {}
      }
      // contactCustomFields.value is text; numeric/date operators cast it. A
      // correlated EXISTS keeps the cast out of the relational filter (which
      // cannot cast a joined column).
      return existsWhere(
        (contactId) =>
          sql`SELECT 1 FROM ${contactCustomFieldModel} WHERE ${contactCustomFieldModel.contactId} = ${contactId} AND ${contactCustomFieldModel.customFieldId} = ${customFieldId} AND ${comparison.predicate}`,
        comparison.negate,
      )
    }

    // ── Conversation relation: archived ───────────────────────────────────────
    case "archived":
      return buildExistsBooleanWhere(
        conversationExists,
        sql`${conversationModel.archivedAt} IS NOT NULL`,
        operator,
        value,
      )

    // ── Conversation relation: followUp ───────────────────────────────────────
    case "followUp":
      return buildExistsBooleanWhere(
        conversationExists,
        sql`${conversationModel.followed} = true`,
        operator,
        value,
      )

    // ── Conversation relation: conversationTransferredToHuman ─────────────────
    case "conversationTransferredToHuman":
      return buildExistsBooleanWhere(
        conversationExists,
        sql`${conversationModel.botEnabled} = false AND (${conversationModel.botResumeAt} IS NULL OR ${conversationModel.botResumeAt} > NOW())`,
        operator,
        value,
      )

    // ── Not yet implemented (complex SQL or low-priority) ─────────────────────
    // continent — not a DB column (derived from country)
    // executedFlow — needs flow-execution join
    // existingContact — always true when a contact record exists
    // contactCreatedDateMinutesAgo — requires EXTRACT(EPOCH …) SQL
    default:
      return {}
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const NUMERIC_VALUE_PATTERN = /^-?\d+(\.\d+)?$/
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

function buildRelationSetWhere(
  field: string,
  operator: string,
  value: unknown,
): ContactWhere {
  const filter = RELATION_SET_FILTERS[field]
  if (!(filter && RELATION_SET_OPERATORS.has(operator))) {
    return {}
  }

  if (operator === operatorTypes.enum.isEmpty) {
    return filter.exists(undefined, true)
  }

  const values = toArrayValue(value)
  const positive =
    operator === operatorTypes.enum.in || operator === operatorTypes.enum.eq
  return filter.exists(inArray(filter.column, values), !positive)
}

const buildRawColumnWhere = (
  columnName: string,
  comparison: (column: AnyColumn) => SQL,
): ContactWhere => ({
  RAW: (table: Record<string, AnyColumn>): SQL => comparison(table[columnName]),
})

function buildColumnWhere(
  columnName: string,
  operator: string,
  value: unknown,
): ContactWhere {
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

function buildDateColumnWhere(
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

  const intervalValue =
    Array.isArray(value) &&
    typeof value[0] === "string" &&
    typeof value[1] === "string" &&
    isValidDateTimeFilterValue(value[0]) &&
    isValidDateTimeFilterValue(value[1])
      ? [value[0], value[1]]
      : undefined

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

function buildLatestContactInboxDateWhere(
  column: AnyColumn,
  operator: string,
  value: unknown,
): ContactWhere {
  const buildLatestWhere = (
    comparison: (latestValue: SQL) => SQL,
  ): ContactWhere => ({
    RAW: (table: Record<string, AnyColumn>): SQL => {
      const latestValue = sql.raw('"latestInteraction"."latest"')
      return sql`EXISTS (
        SELECT 1
        FROM (
          SELECT MAX(${column}) AS "latest"
          FROM ${contactInboxModel}
          WHERE ${contactInboxModel.contactId} = ${table.id}
        ) AS "latestInteraction"
        WHERE ${comparison(latestValue)}
      )`
    },
  })

  if (operator === operatorTypes.enum.isEmpty) {
    return buildLatestWhere((latestValue) => sql`${latestValue} IS NULL`)
  }
  if (operator === operatorTypes.enum.isNotEmpty) {
    return buildLatestWhere((latestValue) => sql`${latestValue} IS NOT NULL`)
  }

  const intervalValue =
    Array.isArray(value) &&
    typeof value[0] === "string" &&
    typeof value[1] === "string" &&
    isValidDateTimeFilterValue(value[0]) &&
    isValidDateTimeFilterValue(value[1])
      ? [value[0], value[1]]
      : undefined

  if (
    operator === operatorTypes.enum.isBetween ||
    operator === operatorTypes.enum.notBetween
  ) {
    if (!intervalValue) {
      return {}
    }

    return buildLatestWhere((latestValue) =>
      operator === operatorTypes.enum.isBetween
        ? sql`(${latestValue} >= ${intervalValue[0]}::timestamptz AND ${latestValue} <= ${intervalValue[1]}::timestamptz)`
        : sql`(${latestValue} < ${intervalValue[0]}::timestamptz OR ${latestValue} > ${intervalValue[1]}::timestamptz OR ${latestValue} IS NULL)`,
    )
  }

  if (
    typeof value !== "string" ||
    value === "" ||
    !isValidDateTimeFilterValue(value)
  ) {
    return {}
  }

  if (
    operator === operatorTypes.enum.eq ||
    operator === operatorTypes.enum.ne
  ) {
    const dayStart = sql`date_trunc('day', ${value}::timestamptz)`
    const dayEnd = sql`${dayStart} + INTERVAL '1 day'`
    return buildLatestWhere((latestValue) =>
      operator === operatorTypes.enum.eq
        ? sql`(${latestValue} >= ${dayStart} AND ${latestValue} < ${dayEnd})`
        : sql`(${latestValue} < ${dayStart} OR ${latestValue} >= ${dayEnd} OR ${latestValue} IS NULL)`,
    )
  }

  switch (operator) {
    case operatorTypes.enum.gt:
      return buildLatestWhere(
        (latestValue) => sql`${latestValue} > ${value}::timestamptz`,
      )
    case operatorTypes.enum.gte:
      return buildLatestWhere(
        (latestValue) => sql`${latestValue} >= ${value}::timestamptz`,
      )
    case operatorTypes.enum.lt:
      return buildLatestWhere(
        (latestValue) => sql`${latestValue} < ${value}::timestamptz`,
      )
    case operatorTypes.enum.lte:
      return buildLatestWhere(
        (latestValue) => sql`${latestValue} <= ${value}::timestamptz`,
      )
    default:
      return {}
  }
}

type CustomFieldComparison = { predicate: SQL; negate: boolean }
type IntervalValue = [string, string]

const NEGATION_TO_POSITIVE: Partial<Record<OperatorType, OperatorType>> = {
  [operatorTypes.enum.ne]: operatorTypes.enum.eq,
  [operatorTypes.enum.notContains]: operatorTypes.enum.contains,
  [operatorTypes.enum.notBetween]: operatorTypes.enum.isBetween,
  [operatorTypes.enum.isEmpty]: operatorTypes.enum.isNotEmpty,
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

/**
 * Builds the positive `value` predicate for a custom-field condition. The stored
 * value is `text`, so numeric/date operators cast it. Date casts use a guarded
 * CASE expression so arbitrary text in a custom-field row does not abort the
 * whole contact list/export query.
 */
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
      return sql`${column} ILIKE ${`%${escapeLikePattern(value)}%`}`
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
      return sql`${column} ILIKE ${`%${escapeLikePattern(value)}%`}`
    case operatorTypes.enum.startsWith:
      return sql`${column} ILIKE ${`${escapeLikePattern(value)}%`}`
    case operatorTypes.enum.endsWith:
      return sql`${column} ILIKE ${`%${escapeLikePattern(value)}`}`
    default:
      return
  }
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
      return { ilike: `%${escapeLikePattern(String(value))}%` }
    case operatorTypes.enum.notContains:
      return { notIlike: `%${escapeLikePattern(String(value))}%` }
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

function buildBooleanFromTimestamp(
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

function buildBooleanColumn(
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

function buildExistsBooleanWhere(
  exists: (predicate: SQL, negate?: boolean) => ContactWhere,
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
