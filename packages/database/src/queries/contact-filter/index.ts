import {
  type AnyColumn,
  inArray,
  relationsFilterToSQL,
  type SQL,
  sql,
} from "drizzle-orm"
import { operatorTypes } from "../../partials"
import {
  contactInboxModel,
  contactModel,
  conversationModel,
} from "../../schema"
import { buildContinentWhere } from "./continent"
import { parseConversationAssigneeValues } from "./conversation-assignee"
import { buildCustomFieldWhere } from "./custom-field-predicates"
import { joinTableExists } from "./exists"
import {
  buildBooleanColumn,
  buildBooleanFromTimestamp,
  buildColumnWhere,
  buildDateColumnWhere,
  buildExistingContactWhere,
  buildExistsBooleanWhere,
  buildLatestContactInboxDateWhere,
  buildLatestContactInboxMinutesAgoWhere,
  buildLatestContactInboxNumberWhere,
  buildMinutesAgoWhere,
  contactInboxInteractedWithin24hSQL as buildRecentInteractionPredicate,
  escapeLikePattern,
} from "./predicates"
import { buildRelationSetWhere, contactInboxExists } from "./relation-sets"
import type {
  ContactWhere,
  ContactFilterConditionInput as FilterConditionInput,
  ContactFilterCriteriaInput as FilterCriteriaInput,
  ContactWhereInput as FilterWhereInput,
} from "./types"

export {
  parseConversationAssigneeValues,
  UNASSIGNED_ASSIGNEE_VALUE,
} from "./conversation-assignee"
export { contactInboxInteractedWithin24hSQL } from "./predicates"
export type {
  ContactFilterConditionInput,
  ContactFilterCriteriaInput,
  ContactWhereInput,
} from "./types"

const hasWhereParts = (where: ContactWhere): boolean =>
  Object.keys(where).length > 0

const conversationExists = joinTableExists(
  conversationModel,
  conversationModel.contactId,
)

const toStringArrayValue = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).filter(
    (item): item is string => typeof item === "string" && item !== "",
  )

const combineWithOr = (predicates: SQL[]): SQL | undefined => {
  if (predicates.length === 0) {
    return
  }

  return predicates
    .slice(1)
    .reduce(
      (combined, predicate) => sql`${combined} OR ${predicate}`,
      predicates[0],
    )
}

const buildConversationAssignedWhere = (
  operator: string,
  value: unknown,
): ContactWhere => {
  if (operator === operatorTypes.enum.isEmpty) {
    return conversationExists(
      sql`(${conversationModel.assignedUserId} IS NOT NULL OR ${conversationModel.assignedInboxTeamId} IS NOT NULL)`,
      true,
    )
  }

  const positive =
    operator === operatorTypes.enum.eq || operator === operatorTypes.enum.in
  const negative =
    operator === operatorTypes.enum.ne || operator === operatorTypes.enum.notIn
  if (!(positive || negative)) {
    return {}
  }

  const selection = parseConversationAssigneeValues(toStringArrayValue(value))
  const predicates: SQL[] = []

  if (selection.userIds.length > 0) {
    predicates.push(
      inArray(conversationModel.assignedUserId, selection.userIds),
    )
  }
  if (selection.inboxTeamIds.length > 0) {
    predicates.push(
      inArray(conversationModel.assignedInboxTeamId, selection.inboxTeamIds),
    )
  }
  if (selection.hasUnassigned) {
    predicates.push(
      sql`${conversationModel.assignedUserId} IS NULL AND ${conversationModel.assignedInboxTeamId} IS NULL`,
    )
  }

  const predicate = combineWithOr(predicates)
  return predicate ? conversationExists(predicate, negative) : {}
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

export function buildContactWhere(input: FilterWhereInput): ContactWhere {
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
  contactFilter: FilterCriteriaInput
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

export function applyContactFilter(
  criteria: FilterCriteriaInput,
): ContactWhere {
  const conditions = criteria.conditions as FilterConditionInput[]
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

function buildConditionWhere(condition: FilterConditionInput): ContactWhere {
  const { field, operator, value } = condition

  switch (field) {
    case "fullName":
    case "email":
    case "gender":
    case "country":
    case "locale":
    case "timezone":
      return buildColumnWhere(field, operator, value)

    case "continent":
      return buildContinentWhere(operator, value)

    case "phone":
      return buildColumnWhere("phoneNumber", operator, value)

    case "contactCreatedAt":
      return buildDateColumnWhere("createdAt", operator, value)

    case "contactCreatedDateMinutesAgo":
      return buildMinutesAgoWhere("createdAt", operator, value)

    case "lastSeen":
      return buildDateColumnWhere("lastReadAt", operator, value)

    case "lastSeenMinutesAgo":
      return buildMinutesAgoWhere("lastReadAt", operator, value)

    case "lastSent":
      return buildLatestContactInboxDateWhere(
        contactInboxModel.lastOutboundMessageAt,
        operator,
        value,
      )

    case "lastInteraction":
      return buildLatestContactInboxDateWhere(
        contactInboxModel.lastIncomingMessageAt,
        operator,
        value,
      )

    case "lastInteractionMinutesAgo":
      return buildLatestContactInboxMinutesAgoWhere(
        contactInboxModel.lastIncomingMessageAt,
        operator,
        value,
      )

    case "consecutiveAiFailures":
      return buildLatestContactInboxNumberWhere(
        contactInboxModel.consecutiveFailedReply,
        operator,
        value,
      )

    case "emailWasVerified":
      return buildBooleanColumn("emailVerified", operator, value)

    case "optedInForEmail":
      return buildBooleanColumn("emailOptIn", operator, value)

    case "existingContact":
      return buildExistingContactWhere(operator, value)

    case "subscribedToBroadcast":
      return buildBooleanFromTimestamp("broadcastSubscribedAt", operator, value)

    case "blocked":
      return buildBooleanFromTimestamp("blockedAt", operator, value)

    case "interactedInLast24h":
      return buildExistsBooleanWhere(
        contactInboxExists,
        buildRecentInteractionPredicate(),
        operator,
        value,
      )

    case "tags":
    case "source":
    case "currentChannel":
    case "inbox":
    case "language":
    case "broadcastSent":
    case "broadcastDelivered":
    case "broadcastSeen":
    case "broadcastClicked":
    case "broadcastFailed":
    case "subscribedToDripCampaign":
    case "entryPointsLinks":
      return buildRelationSetWhere(field, operator, value)

    case "conversationAssigned":
      return buildConversationAssignedWhere(operator, value)

    case "customField":
      return buildCustomFieldWhere(condition)

    case "archived":
      return buildExistsBooleanWhere(
        conversationExists,
        sql`${conversationModel.archivedAt} IS NOT NULL`,
        operator,
        value,
      )

    case "followUp":
      return buildExistsBooleanWhere(
        conversationExists,
        sql`${conversationModel.followed} = true`,
        operator,
        value,
      )

    case "conversationTransferredToHuman":
      return buildExistsBooleanWhere(
        conversationExists,
        sql`${conversationModel.botEnabled} = false AND (${conversationModel.botResumeAt} IS NULL OR ${conversationModel.botResumeAt} > NOW())`,
        operator,
        value,
      )

    case "unreplied":
      return buildExistsBooleanWhere(
        contactInboxExists,
        sql`${contactInboxModel.lastIncomingMessageAt} IS NOT NULL AND (${contactInboxModel.lastOutboundMessageAt} IS NULL OR ${contactInboxModel.lastIncomingMessageAt} > ${contactInboxModel.lastOutboundMessageAt})`,
        operator,
        value,
      )

    case "unread":
      return buildExistsBooleanWhere(
        conversationExists,
        sql`${conversationModel.lastActivityAt} IS NOT NULL AND (${conversationModel.agentLastReadAt} IS NULL OR ${conversationModel.lastActivityAt} > ${conversationModel.agentLastReadAt})`,
        operator,
        value,
      )

    default:
      return {}
  }
}
