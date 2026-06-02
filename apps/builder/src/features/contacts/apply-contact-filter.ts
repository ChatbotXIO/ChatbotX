import { sql } from "@chatbotx.io/database/client"
import { operatorTypes } from "@chatbotx.io/database/partials"
import type {
  ContactFilterCondition,
  ContactFilterCriteria,
} from "./schemas/contact-filter"

type ContactWhere = Record<string, unknown>

/**
 * Maps a ContactFilterCriteria to a Drizzle relational `where` object for ContactModel.
 *
 * Handles:
 *  - Direct columns (fullName, email, gender, country, locale)
 *  - Column aliases (phone → phoneNumber, contactCreatedAt → createdAt)
 *  - Boolean-from-timestamp (subscribedToBroadcast → broadcastSubscribedAt, blocked → blockedAt)
 *  - Time-based booleans (interactedInLast24h → lastActivityAt)
 *  - Relations (tags, customFields, source / currentChannel → contactInboxes)
 *  - Conversation relations (archived, conversationTransferredToHuman)
 *
 * Fields that require complex SQL and are not yet implemented simply produce no condition.
 */
export function applyContactFilter(
  criteria: ContactFilterCriteria,
): ContactWhere {
  const conditions = criteria.conditions as ContactFilterCondition[]
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

  // AND: merge all conditions into a single where object
  return Object.assign({}, ...conditionWheres) as ContactWhere
}

function buildConditionWhere(condition: ContactFilterCondition): ContactWhere {
  const { field, operator } = condition
  const value = "value" in condition ? condition.value : undefined

  switch (field) {
    // ── Direct contact columns ────────────────────────────────────────────────
    case "fullName":
    case "email":
    case "gender":
    case "country":
    case "locale":
      return { [field]: applyOperator(operator, value) }

    // ── Column aliases ────────────────────────────────────────────────────────
    case "phone":
      return { phoneNumber: applyOperator(operator, value) }

    case "contactCreatedAt":
      return { createdAt: applyOperator(operator, value) }

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
        ? { lastActivityAt: { gte: threshold } }
        : { lastActivityAt: { lt: threshold } }
    }

    // ── Relation: tags (name in / notIn) ─────────────────────────────────────
    case "tags": {
      if (
        operator !== operatorTypes.enum.in &&
        operator !== operatorTypes.enum.notIn &&
        operator !== operatorTypes.enum.isEmpty
      ) {
        return {}
      }
      if (operator === operatorTypes.enum.isEmpty) {
        return { tags: { isNull: true } }
      }
      const tagOp = operator === operatorTypes.enum.in ? "in" : "notIn"
      return { tags: { name: { [tagOp]: value } } }
    }

    // ── Relation: customFields (customFieldId in / notIn) ────────────────────
    case "customFields": {
      if (
        operator !== operatorTypes.enum.in &&
        operator !== operatorTypes.enum.notIn &&
        operator !== operatorTypes.enum.isEmpty
      ) {
        return {}
      }
      if (operator === operatorTypes.enum.isEmpty) {
        return { contactCustomFields: { isNull: true } }
      }
      const cfOp = operator === operatorTypes.enum.in ? "in" : "notIn"
      return { contactCustomFields: { customFieldId: { [cfOp]: value } } }
    }

    // ── Relation: contactInboxes (source / currentChannel) ───────────────────
    case "source":
    case "currentChannel": {
      if (
        operator !== operatorTypes.enum.in &&
        operator !== operatorTypes.enum.notIn &&
        operator !== operatorTypes.enum.isEmpty
      ) {
        return {}
      }
      if (operator === operatorTypes.enum.isEmpty) {
        return { contactInboxes: { isNull: true } }
      }
      const channelOp = operator === operatorTypes.enum.in ? "in" : "notIn"
      return { contactInboxes: { channel: { [channelOp]: value } } }
    }

    // ── Conversation relation: archived ───────────────────────────────────────
    case "archived":
      return buildBooleanConversationRelation("archivedAt", operator, value)

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

function applyOperator(operator: string, value: unknown): unknown {
  switch (operator) {
    case operatorTypes.enum.eq:
      return value
    case operatorTypes.enum.ne:
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
    case operatorTypes.enum.startsWith:
      return { startsWith: value }
    case operatorTypes.enum.endsWith:
      return { endsWith: value }
    case operatorTypes.enum.lt:
      return { lt: value }
    case operatorTypes.enum.lte:
      return { lte: value }
    case operatorTypes.enum.gt:
      return { gt: value }
    case operatorTypes.enum.gte:
      return { gte: value }
    case operatorTypes.enum.isBetween:
      return { between: value }
    case operatorTypes.enum.notBetween:
      return { notBetween: value }
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
