import { type SQL, sql } from "drizzle-orm"
import { env } from "../../keys"
import { operatorTypes } from "../../partials"
import {
  CONTACT_ACTIVITY_FILTERS,
  type ContactActivityFilterConfig,
  type ContactActivityFilterField,
  type ContactActivityReference,
  parseContactActivityReferences,
  UNSCOPED_PARENT_REFERENCE_ID,
} from "../../partials/contact-activity"
import {
  contactActivityModel,
  contactKeywordMessageModel,
  contactStateModel,
} from "../../schema"
import { escapeLikePattern } from "../../utils"
import { existsWhere } from "./exists"
import { resolveTimestamptzComparison } from "./predicates"
import type { ContactWhere } from "./types"

// A saved condition that cannot be evaluated (unknown operator, malformed id,
// no workspace, kill switch off) must fail CLOSED. Returning `{}` would drop it
// from an AND group and silently widen the audience to everyone the other
// conditions match.
const matchesNobody: ContactWhere = { RAW: () => sql`FALSE` }

const referenceInList = (
  config: ContactActivityFilterConfig,
  references: ContactActivityReference[],
): SQL =>
  config.parentScoped
    ? sql`(a."parentReferenceId", a."referenceId") IN (${sql.join(
        references.map(
          (reference) =>
            sql`(${reference.parentReferenceId}::bigint, ${reference.referenceId}::bigint)`,
        ),
        sql`, `,
      )})`
    : sql`a."parentReferenceId" = ${UNSCOPED_PARENT_REFERENCE_ID}::bigint AND a."referenceId" = ANY(ARRAY[${sql.join(
        references.map((reference) => sql`${reference.referenceId}::bigint`),
        sql`, `,
      )}]::bigint[])`

const NEGATIVE_OPERATORS = new Set<string>([
  operatorTypes.enum.notIn,
  operatorTypes.enum.ne,
])
const POSITIVE_OPERATORS = new Set<string>([
  operatorTypes.enum.in,
  operatorTypes.enum.eq,
])

/** Whether the activity-backed filters are enabled (kill switch). */
export const isContactActivityFiltersEnabled = (): boolean =>
  env.CONTACT_ACTIVITY_FILTERS_ENABLED

const activityFiltersEnabled = (workspaceId: string | undefined): boolean =>
  Boolean(workspaceId) && isContactActivityFiltersEnabled()

/**
 * Executed Flow / Step, Keywords Received, Completed WhatsApp Flows and the four
 * Email phases, all generated from `CONTACT_ACTIVITY_FILTERS`. Every operator is
 * an existence test on the contact's activity rows; the negatives are the exact
 * `NOT EXISTS` complement, so a contact with no history at all matches them.
 * Each subquery carries a parameterized `workspaceId =` so Postgres prunes to
 * the workspace's single partition.
 */
export const buildContactActivityWhere = (
  field: ContactActivityFilterField,
  operator: string,
  value: unknown,
  workspaceId: string | undefined,
): ContactWhere => {
  if (!(workspaceId && activityFiltersEnabled(workspaceId))) {
    return matchesNobody
  }

  const config = CONTACT_ACTIVITY_FILTERS[field]
  const anyActivity = (contactId: unknown) => sql`SELECT 1
    FROM ${contactActivityModel} a
    WHERE a."workspaceId" = ${workspaceId}::bigint
      AND a."contactId" = ${contactId}
      AND a."activityType" = ${config.activityType}::"contactActivityType"
      AND a."referenceType" = ${config.referenceType}::"contactActivityReferenceType"`

  if (operator === operatorTypes.enum.isEmpty) {
    return existsWhere((contactId) => anyActivity(contactId), true)
  }
  if (operator === operatorTypes.enum.isNotEmpty) {
    return existsWhere((contactId) => anyActivity(contactId))
  }
  if (!(POSITIVE_OPERATORS.has(operator) || NEGATIVE_OPERATORS.has(operator))) {
    return matchesNobody
  }

  const references = parseContactActivityReferences(config, value)
  if (!references) {
    return matchesNobody
  }
  return existsWhere(
    (contactId) => sql`${anyActivity(contactId)}
      AND ${referenceInList(config, references)}`,
    NEGATIVE_OPERATORS.has(operator),
  )
}

const MAX_SENT_MESSAGE_LENGTH = 1000

/**
 * Positive text predicates over the pre-normalized message. `eq` and
 * `startsWith` hit the `text_pattern_ops` btree, `contains` and `endsWith` the
 * trigram index. The caller wraps negatives in NOT EXISTS.
 */
const SENT_MESSAGE_PREDICATES: Record<
  string,
  (needle: string, normalizedText: SQL) => SQL
> = {
  [operatorTypes.enum.eq]: (needle, text) => sql`${text} = ${needle}`,
  [operatorTypes.enum.startsWith]: (needle, text) =>
    sql`${text} LIKE ${`${escapeLikePattern(needle)}%`}`,
  [operatorTypes.enum.contains]: (needle, text) =>
    sql`${text} LIKE ${`%${escapeLikePattern(needle)}%`}`,
  [operatorTypes.enum.endsWith]: (needle, text) =>
    sql`${text} LIKE ${`%${escapeLikePattern(needle)}`}`,
}

/** Negative operator -> the positive predicate it is the complement of. */
const SENT_MESSAGE_NEGATIONS: Record<string, string> = {
  [operatorTypes.enum.ne]: operatorTypes.enum.eq,
  [operatorTypes.enum.notContains]: operatorTypes.enum.contains,
}

/**
 * "Sent message": the full text of the contact's inbound messages that matched
 * a keyword rule, compared accent- and case-insensitively against the same
 * normalized form the writer stores.
 */
export const buildSentMessageWhere = (
  operator: string,
  value: unknown,
  workspaceId: string | undefined,
  normalize: (text: string) => string,
): ContactWhere => {
  if (!(workspaceId && activityFiltersEnabled(workspaceId))) {
    return matchesNobody
  }

  const anyMessage = (contactId: unknown) => sql`SELECT 1
    FROM ${contactKeywordMessageModel} m
    WHERE m."workspaceId" = ${workspaceId}::bigint
      AND m."contactId" = ${contactId}`

  if (operator === operatorTypes.enum.isEmpty) {
    return existsWhere((contactId) => anyMessage(contactId), true)
  }
  if (operator === operatorTypes.enum.isNotEmpty) {
    return existsWhere((contactId) => anyMessage(contactId))
  }

  const negated = operator in SENT_MESSAGE_NEGATIONS
  const predicate =
    SENT_MESSAGE_PREDICATES[SENT_MESSAGE_NEGATIONS[operator] ?? operator]
  if (
    !predicate ||
    typeof value !== "string" ||
    value.length > MAX_SENT_MESSAGE_LENGTH
  ) {
    return matchesNobody
  }

  // Judged after normalizing: text made only of combining marks is blank once
  // folded, and `LIKE '%%'` would match every contact that has any message.
  const needle = normalize(value).trim()
  if (needle === "") {
    return matchesNobody
  }
  return existsWhere(
    (contactId) => sql`${anyMessage(contactId)}
      AND ${predicate(needle, sql`m."normalizedText"`)}`,
    negated,
  )
}

/** Negative date operator -> the positive window it is the complement of. */
const LAST_DELIVERED_NEGATIONS: Record<string, string> = {
  [operatorTypes.enum.ne]: operatorTypes.enum.eq,
  [operatorTypes.enum.notBetween]: operatorTypes.enum.isBetween,
}

/**
 * "Last Delivered": the contact's latest confirmed delivery. A contact with no
 * `ContactState` row has no value, so the null-safe negatives (`ne`,
 * `notBetween`) are `NOT EXISTS` of their positive window and include them.
 */
export const buildLastDeliveredWhere = (
  operator: string,
  value: unknown,
  workspaceId: string | undefined,
  timezone: string,
): ContactWhere => {
  if (!(workspaceId && activityFiltersEnabled(workspaceId))) {
    return matchesNobody
  }

  const hasValue = (contactId: unknown) => sql`SELECT 1
    FROM ${contactStateModel} s
    WHERE s."workspaceId" = ${workspaceId}::bigint
      AND s."contactId" = ${contactId}
      AND s."lastDeliveredAt" IS NOT NULL`

  if (operator === operatorTypes.enum.isEmpty) {
    return existsWhere((contactId) => hasValue(contactId), true)
  }
  if (operator === operatorTypes.enum.isNotEmpty) {
    return existsWhere((contactId) => hasValue(contactId))
  }

  const negated = operator in LAST_DELIVERED_NEGATIONS
  const render = resolveTimestamptzComparison(
    LAST_DELIVERED_NEGATIONS[operator] ?? operator,
    value,
    timezone,
  )
  if (!render) {
    return matchesNobody
  }
  return existsWhere(
    (contactId) => sql`${hasValue(contactId)}
      AND ${render(sql`s."lastDeliveredAt"`)}`,
    negated,
  )
}
