import {
  type AnyColumn,
  relationsFilterToSQL,
  type SQL,
  sql,
} from "drizzle-orm"
import { operatorTypes } from "../partials"
import { contactCustomFieldModel, contactModel } from "../schema"

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

const buildKeywordWhere = (keyword: string): ContactWhere => {
  const normalizedKeyword = `%${keyword.toLowerCase()}%`

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

/**
 * Maps a contact filter criteria to a Drizzle relational `where` object for
 * ContactModel. Shared between the builder app (contact list) and the worker
 * (contact export) so both resolve the same contacts for a given filter.
 *
 * Handles:
 *  - Direct columns (fullName, email, gender, country, locale, timezone)
 *  - Column aliases (phone → phoneNumber, contactCreatedAt → createdAt)
 *  - Boolean-from-timestamp (subscribedToBroadcast → broadcastSubscribedAt, blocked → blockedAt)
 *  - Time-based booleans (interactedInLast24h → lastActivityAt)
 *  - Relations (tags, source / currentChannel / inbox → contactInboxes)
 *  - Conversation relations (archived, conversationTransferredToHuman)
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
      return buildDateColumnWhere("lastActivityAt", operator, value)

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
    case "interactedInLast24h": {
      if (operator !== operatorTypes.enum.eq) {
        return {}
      }
      const threshold = sql`NOW() - INTERVAL '24 hours'`
      return value === "true"
        ? {
            contactInboxes: {
              some: { lastIncomingMessageAt: { gte: threshold } },
            },
          }
        : {
            contactInboxes: {
              none: { lastIncomingMessageAt: { gte: threshold } },
            },
          }
    }

    // ── Relation: tags (name in / notIn) ─────────────────────────────────────
    case "tags": {
      if (
        operator !== operatorTypes.enum.in &&
        operator !== operatorTypes.enum.notIn &&
        operator !== operatorTypes.enum.eq &&
        operator !== operatorTypes.enum.ne &&
        operator !== operatorTypes.enum.isEmpty
      ) {
        return {}
      }
      if (operator === operatorTypes.enum.isEmpty) {
        return { tags: { isNull: true } }
      }
      const tagOp =
        operator === operatorTypes.enum.in || operator === operatorTypes.enum.eq
          ? "in"
          : "notIn"
      return { tags: { id: { [tagOp]: value } } }
    }

    // ── Relation: contactInboxes (source) ────────────────────────────────────
    case "source": {
      if (
        operator !== operatorTypes.enum.in &&
        operator !== operatorTypes.enum.notIn &&
        operator !== operatorTypes.enum.eq &&
        operator !== operatorTypes.enum.ne &&
        operator !== operatorTypes.enum.isEmpty
      ) {
        return {}
      }
      if (operator === operatorTypes.enum.isEmpty) {
        return { contactInboxes: { isNull: true } }
      }
      const sourceOp =
        operator === operatorTypes.enum.in || operator === operatorTypes.enum.eq
          ? "in"
          : "notIn"
      return { contactInboxes: { source: { [sourceOp]: value } } }
    }

    // ── Relation: contactInboxes (currentChannel) ───────────────────────────
    case "currentChannel": {
      if (
        operator !== operatorTypes.enum.in &&
        operator !== operatorTypes.enum.notIn &&
        operator !== operatorTypes.enum.eq &&
        operator !== operatorTypes.enum.ne &&
        operator !== operatorTypes.enum.isEmpty
      ) {
        return {}
      }
      if (operator === operatorTypes.enum.isEmpty) {
        return { contactInboxes: { isNull: true } }
      }
      const channelOp =
        operator === operatorTypes.enum.in || operator === operatorTypes.enum.eq
          ? "in"
          : "notIn"
      return { contactInboxes: { channel: { [channelOp]: value } } }
    }

    // ── Relation: contactInboxes (inboxId) ──────────────────────────────────
    case "inbox": {
      if (
        operator !== operatorTypes.enum.in &&
        operator !== operatorTypes.enum.notIn &&
        operator !== operatorTypes.enum.eq &&
        operator !== operatorTypes.enum.ne &&
        operator !== operatorTypes.enum.isEmpty
      ) {
        return {}
      }
      if (operator === operatorTypes.enum.isEmpty) {
        return { contactInboxes: { isNull: true } }
      }
      const inboxOp =
        operator === operatorTypes.enum.in || operator === operatorTypes.enum.eq
          ? "in"
          : "notIn"
      return { contactInboxes: { inboxId: { [inboxOp]: value } } }
    }

    // ── Dynamic custom field (value match on contactCustomFields) ─────────────
    case "customField": {
      const customFieldId = condition.customFieldId
      if (!customFieldId) {
        return {}
      }
      const comparison = buildCustomFieldValueComparison(
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
      return {
        RAW: (table: Record<string, AnyColumn>): SQL =>
          sql`EXISTS (SELECT 1 FROM ${contactCustomFieldModel} WHERE ${contactCustomFieldModel.contactId} = ${table.id} AND ${contactCustomFieldModel.customFieldId} = ${customFieldId} AND ${comparison})`,
      }
    }

    // ── Conversation relation: archived ───────────────────────────────────────
    case "archived":
      return buildBooleanConversationRelation("archivedAt", operator, value)

    // ── Conversation relation: followUp ───────────────────────────────────────
    case "followUp":
      return buildBooleanConversationColumn("followed", operator, value)

    // ── Conversation relation: conversationTransferredToHuman ─────────────────
    case "conversationTransferredToHuman": {
      if (operator !== operatorTypes.enum.eq) {
        return {}
      }
      // transferred to human ⟺ bot disabled
      return { conversation: { botEnabled: value !== "true" } }
    }

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
    return buildRawColumnWhere(
      columnName,
      (column) => sql`${column} ILIKE ${`${value}%`}`,
    )
  }

  if (
    typeof value === "string" &&
    value !== "" &&
    operator === operatorTypes.enum.endsWith
  ) {
    return buildRawColumnWhere(
      columnName,
      (column) => sql`${column} ILIKE ${`%${value}`}`,
    )
  }

  if (
    operator === operatorTypes.enum.isBetween ||
    operator === operatorTypes.enum.notBetween
  ) {
    return {}
  }

  return { [columnName]: applyOperator(operator, value) }
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
        : sql`(${column} < ${intervalValue[0]}::timestamptz OR ${column} > ${intervalValue[1]}::timestamptz)`,
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
      return sql`(${column} < ${dayStart} OR ${column} >= ${dayEnd})`
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

/**
 * Builds the `value`-comparison SQL for a custom-field condition. The stored
 * value is `text`, so numeric/date operators cast it. Date casts use a guarded
 * CASE expression so arbitrary text in a custom-field row does not abort the
 * whole contact list/export query. Returns `undefined` for unsupported
 * operator/type combos, which the caller treats as a no-op condition.
 */
function buildCustomFieldValueComparison(
  operator: string,
  value: unknown,
  valueType: string | undefined,
): SQL | undefined {
  const column = contactCustomFieldModel.value

  if (operator === operatorTypes.enum.isEmpty) {
    return sql`(${column} IS NULL OR ${column} = '')`
  }
  if (operator === operatorTypes.enum.isNotEmpty) {
    return sql`(${column} IS NOT NULL AND ${column} <> '')`
  }

  const isIntervalOperator =
    operator === operatorTypes.enum.isBetween ||
    operator === operatorTypes.enum.notBetween
  const intervalValue =
    Array.isArray(value) &&
    typeof value[0] === "string" &&
    typeof value[1] === "string" &&
    value[0] !== "" &&
    value[1] !== ""
      ? [value[0], value[1]]
      : undefined

  if (isIntervalOperator && !intervalValue) {
    return
  }

  if (valueType === "number") {
    if (intervalValue) {
      if (
        !(
          NUMERIC_VALUE_PATTERN.test(intervalValue[0]) &&
          NUMERIC_VALUE_PATTERN.test(intervalValue[1])
        )
      ) {
        return
      }
      const numeric = sql`NULLIF(${column}, '')::numeric`
      const guard = sql`${column} ~ '^-?[0-9]+(\\.[0-9]+)?$'`
      const min = Number(intervalValue[0])
      const max = Number(intervalValue[1])
      if (operator === operatorTypes.enum.isBetween) {
        return sql`(${guard} AND ${numeric} >= ${min} AND ${numeric} <= ${max})`
      }
      // Invalid stored values are intentionally outside a negated numeric range.
      return sql`(NOT ${guard} OR ${numeric} < ${min} OR ${numeric} > ${max})`
    }

    if (typeof value !== "string" || value === "") {
      return
    }

    switch (operator) {
      case operatorTypes.enum.contains:
        return sql`${column} ILIKE ${`%${value}%`}`
      case operatorTypes.enum.notContains:
        return sql`${column} NOT ILIKE ${`%${value}%`}`
      case operatorTypes.enum.startsWith:
        return sql`${column} ILIKE ${`${value}%`}`
      case operatorTypes.enum.endsWith:
        return sql`${column} ILIKE ${`%${value}`}`
      default:
        break
    }

    if (!NUMERIC_VALUE_PATTERN.test(value)) {
      return
    }
    const numeric = sql`NULLIF(${column}, '')::numeric`
    const guard = sql`${column} ~ '^-?[0-9]+(\\.[0-9]+)?$'`
    const n = Number(value)
    switch (operator) {
      case operatorTypes.enum.eq:
        return sql`(${guard} AND ${numeric} = ${n})`
      case operatorTypes.enum.ne:
        // Invalid stored values are intentionally not equal to any valid number.
        return sql`(NOT ${guard} OR ${numeric} <> ${n})`
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

  if (valueType === "datetime") {
    const guard = sql`(${column} IS NOT NULL AND ${column} <> '' AND ${column} ~ ${DATETIME_VALUE_PATTERN})`
    const ts = sql`CASE WHEN ${guard} THEN NULLIF(${column}, '')::timestamptz END`

    if (intervalValue) {
      if (
        !(
          isValidDateTimeFilterValue(intervalValue[0]) &&
          isValidDateTimeFilterValue(intervalValue[1])
        )
      ) {
        return
      }

      if (operator === operatorTypes.enum.isBetween) {
        return sql`(${guard} AND ${ts} >= ${intervalValue[0]}::timestamptz AND ${ts} <= ${intervalValue[1]}::timestamptz)`
      }

      // Invalid stored values are intentionally outside a negated date range.
      return sql`(${guard} IS NOT TRUE OR ${ts} < ${intervalValue[0]}::timestamptz OR ${ts} > ${intervalValue[1]}::timestamptz)`
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
      case operatorTypes.enum.ne:
        // Invalid stored values are intentionally not equal to any valid date.
        return sql`(${guard} IS NOT TRUE OR ${ts} < ${dayStart} OR ${ts} >= ${dayEnd})`
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

  if (typeof value !== "string" || value === "") {
    return
  }

  // text / boolean / select — plain text comparison
  switch (operator) {
    case operatorTypes.enum.eq:
      return sql`${column} = ${value}`
    case operatorTypes.enum.ne:
      return sql`${column} <> ${value}`
    case operatorTypes.enum.contains:
      return sql`${column} ILIKE ${`%${value}%`}`
    case operatorTypes.enum.notContains:
      return sql`${column} NOT ILIKE ${`%${value}%`}`
    case operatorTypes.enum.startsWith:
      return sql`${column} ILIKE ${`${value}%`}`
    case operatorTypes.enum.endsWith:
      return sql`${column} ILIKE ${`%${value}`}`
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
      return { ilike: `%${value}%` }
    case operatorTypes.enum.notContains:
      return { notIlike: `%${value}%` }
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

function buildBooleanConversationColumn(
  column: string,
  operator: string,
  value: unknown,
): ContactWhere {
  if (operator === operatorTypes.enum.isEmpty) {
    return { conversation: { [column]: { isNull: true } } }
  }
  if (operator === operatorTypes.enum.eq) {
    return { conversation: { [column]: value === "true" } }
  }
  return {}
}

function buildBooleanConversationRelation(
  column: string,
  operator: string,
  value: unknown,
): ContactWhere {
  if (operator === operatorTypes.enum.isEmpty) {
    return { conversation: { [column]: { isNull: true } } }
  }
  if (operator === operatorTypes.enum.isNotEmpty) {
    return { conversation: { [column]: { isNotNull: true } } }
  }
  if (operator === operatorTypes.enum.eq) {
    return value === "true"
      ? { conversation: { [column]: { isNotNull: true } } }
      : { conversation: { [column]: { isNull: true } } }
  }
  return {}
}
