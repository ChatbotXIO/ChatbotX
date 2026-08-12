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
  couponModel,
  questionnaireModel,
  questionnaireSubmissionModel,
} from "../../schema"
import { escapeLikePattern, likeContains } from "../../utils"
import { buildContinentWhere } from "./continent"
import { parseConversationAssigneeValues } from "./conversation-assignee"
import {
  buildCtwaSegmentContactExists,
  ctwaRetargetDateRange,
  ctwaRetargetSegments,
} from "./ctwa-retarget"
import { buildCustomFieldWhere } from "./custom-field-predicates"
import { contactInboxExists, existsWhere, joinTableExists } from "./exists"
import {
  buildBooleanColumn,
  buildBooleanFromTimestamp,
  buildColumnWhere,
  buildDateColumnWhere,
  buildExistingContactWhere,
  buildExistsBooleanWhere,
  buildHasContactInfoWhere,
  buildLastCommentWhere,
  buildLatestContactInboxDateWhere,
  buildLatestContactInboxMinutesAgoWhere,
  buildLatestContactInboxNumberWhere,
  buildLatestContactInboxTextWhere,
  buildMinutesAgoWhere,
  contactInboxInteractedWithin24hSQL as buildRecentInteractionPredicate,
} from "./predicates"
import { buildRelationSetWhere } from "./relation-sets"
import { resolveFilterTimezone } from "./timezone"
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
export {
  buildCtwaSegmentContactExists,
  buildCtwaSegmentPredicate,
  type CtwaRetargetSegment,
  type CtwaSegmentPredicateInput,
  ctwaRetargetDateRange,
  ctwaRetargetSegments,
} from "./ctwa-retarget"
export {
  EMAIL_PHONE_FILTER_FIELDS,
  pruneContactFilterFields,
  pruneEmailPhoneFilterConditions,
} from "./permission"
export { contactInboxInteractedWithin24hSQL } from "./predicates"
export {
  DEFAULT_FILTER_TIMEZONE,
  filterValueToUtcDayEndIso,
  filterValueToUtcDayStartIso,
  filterValueToUtcIso,
  resolveFilterTimezone,
} from "./timezone"
export type {
  ContactFilterConditionInput,
  ContactFilterCriteriaInput,
  ContactWhereInput,
} from "./types"
export {
  DATETIME_VALUE_PATTERN,
  isValidDateTimeFilterValue,
  NUMERIC_VALUE_PATTERN,
  valueContainsVariablePlaceholder,
} from "./value-format"

const hasWhereParts = (where: ContactWhere): boolean =>
  Object.keys(where).length > 0

export const contactFilterHasPredicate = (
  criteria: FilterCriteriaInput,
): boolean => hasWhereParts(applyContactFilter(criteria))

type ContactFilterContext = {
  timezone: string
  /** Optional workspace scope, read only by the `ctwaRetarget` case. */
  workspaceId?: string
}

const conversationExists = joinTableExists(
  conversationModel,
  conversationModel.contactId,
)

const questionnaireSubmissionExists = joinTableExists(
  questionnaireSubmissionModel,
  questionnaireSubmissionModel.contactId,
)

const couponExists = (
  predicate: (contactId: AnyColumn, workspaceId: AnyColumn) => SQL,
  negate = false,
): ContactWhere =>
  existsWhere(
    (contactId, contactTable) =>
      sql`SELECT 1 FROM ${couponModel} WHERE ${couponModel.issuedContactId} = ${contactId} AND ${predicate(contactId, contactTable.workspaceId)}`,
    negate,
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

/**
 * Dynamic per-coupon-topic condition (one filter field per real workspace
 * topic, `field: "couponTopic"` + runtime `topicId` — same shape as custom
 * fields): `isNotEmpty` = issued this topic, `used` = redeemed this topic,
 * `eq` = issued this topic with a specific coupon code.
 */
const buildCouponTopicWhere = (
  topicId: string | undefined,
  operator: string,
  value: unknown,
): ContactWhere => {
  if (!topicId) {
    return {}
  }

  const topicPredicate = (_contactId: AnyColumn, workspaceId: AnyColumn) =>
    sql`${couponModel.workspaceId} = ${workspaceId} AND ${couponModel.topicId} = ${topicId}`

  if (operator === operatorTypes.enum.isNotEmpty) {
    return couponExists(topicPredicate)
  }

  if (operator === operatorTypes.enum.used) {
    return couponExists(
      (_contactId, workspaceId) =>
        sql`${couponModel.workspaceId} = ${workspaceId} AND ${couponModel.topicId} = ${topicId} AND ${couponModel.usedAt} IS NOT NULL`,
    )
  }

  if (
    operator === operatorTypes.enum.eq &&
    typeof value === "string" &&
    value
  ) {
    return couponExists(
      (_contactId, workspaceId) =>
        sql`${couponModel.workspaceId} = ${workspaceId} AND ${couponModel.topicId} = ${topicId} AND ${couponModel.code} ILIKE ${escapeLikePattern(value)}`,
    )
  }

  return {}
}

const EMAIL_KEYWORD_PATTERN = /@/
const PHONE_KEYWORD_PATTERN = /^[+\d\s\-()]+$/
const PURE_DIGITS_KEYWORD_PATTERN = /^\d+$/

type SmartKeywordOptions = {
  includeEmailAndPhone?: boolean
  includeSourceId?: boolean
}

export const buildSmartKeywordWhere = (
  keyword: string,
  options: SmartKeywordOptions = {},
): ContactWhere => {
  const trimmedKeyword = keyword.trim()
  if (trimmedKeyword === "") {
    return {}
  }

  const includeEmailAndPhone = options.includeEmailAndPhone !== false
  const includeSourceId = options.includeSourceId !== false
  const normalizedKeyword = trimmedKeyword.toLowerCase()
  const likeKeyword = likeContains(normalizedKeyword)
  const sourceIdWhere = includeSourceId
    ? contactInboxExists(
        sql`${contactInboxModel.sourceId} = ${trimmedKeyword}`,
        false,
      )
    : undefined

  // When the scope hides email/phone, email- and phone-like inputs fall back
  // here instead of returning {} — an empty where would silently drop the
  // keyword and render a fully unfiltered list.
  const namesAndSourceIdWhere: ContactWhere = {
    OR: [
      { firstName: { ilike: likeKeyword } },
      { lastName: { ilike: likeKeyword } },
      ...(sourceIdWhere ? [sourceIdWhere] : []),
    ],
  }

  if (EMAIL_KEYWORD_PATTERN.test(trimmedKeyword)) {
    return includeEmailAndPhone
      ? { email: { ilike: likeKeyword } }
      : namesAndSourceIdWhere
  }

  const digitCount = trimmedKeyword.replace(/\D/g, "").length
  if (PURE_DIGITS_KEYWORD_PATTERN.test(trimmedKeyword)) {
    return {
      OR: [
        { firstName: { ilike: likeKeyword } },
        { lastName: { ilike: likeKeyword } },
        ...(includeEmailAndPhone
          ? [
              { email: { ilike: likeKeyword } },
              { phoneNumber: { ilike: likeKeyword } },
            ]
          : []),
        ...(sourceIdWhere ? [sourceIdWhere] : []),
      ],
    }
  }

  if (PHONE_KEYWORD_PATTERN.test(trimmedKeyword) && digitCount >= 6) {
    const normalizedPhoneKeyword = trimmedKeyword.replace(/[\s\-()]/g, "")
    return includeEmailAndPhone
      ? { phoneNumber: { ilike: likeContains(normalizedPhoneKeyword) } }
      : namesAndSourceIdWhere
  }

  return namesAndSourceIdWhere
}

export function buildContactWhere(input: FilterWhereInput): ContactWhere {
  const where: ContactWhere = {
    workspaceId: input.workspaceId,
  }

  const filters = [
    input.keyword ? buildSmartKeywordWhere(input.keyword) : undefined,
    input.contactFilter
      ? applyContactFilter(input.contactFilter, input.workspaceId)
      : undefined,
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

  if (!contactFilterHasPredicate(contactFilter)) {
    return sql`FALSE`
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
    return sql`FALSE`
  }

  return sql`${contactIdColumn} IN (SELECT ${contactModel.id} FROM ${contactModel} WHERE ${contactWhereSQL})`
}

export function applyContactFilter(
  criteria: FilterCriteriaInput,
  workspaceId?: string,
): ContactWhere {
  const conditions = criteria.conditions as FilterConditionInput[]
  if (conditions.length === 0) {
    return {}
  }

  const context: ContactFilterContext = {
    timezone: resolveFilterTimezone(criteria.timezone),
    workspaceId,
  }
  const conditionWheres = conditions
    .map((condition) => buildConditionWhere(condition, context))
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
  condition: FilterConditionInput,
  context: ContactFilterContext,
): ContactWhere {
  const { timezone } = context
  const { field, operator, value } = condition

  switch (field) {
    case "fullName":
    case "email":
      return buildColumnWhere(field, operator, value, {
        caseInsensitiveEquality: true,
      })

    case "continent":
      return buildContinentWhere(operator, value)

    case "phone":
      return buildColumnWhere("phoneNumber", operator, value, {
        caseInsensitiveEquality: true,
      })

    case "lastComment":
      return buildLastCommentWhere(operator, value)

    case "gender":
    case "country":
    case "locale":
    case "timezone":
      return buildColumnWhere(field, operator, value)

    case "contactCreatedAt":
      return buildDateColumnWhere("createdAt", operator, value, timezone)

    case "contactCreatedDateMinutesAgo":
      return buildMinutesAgoWhere("createdAt", operator, value)

    case "lastSeen":
      return buildLatestContactInboxDateWhere(
        contactInboxModel.contactLastReadAt,
        operator,
        value,
        timezone,
      )

    case "lastSeenMinutesAgo":
      return buildLatestContactInboxMinutesAgoWhere(
        contactInboxModel.contactLastReadAt,
        operator,
        value,
      )

    case "lastSent":
      return buildLatestContactInboxDateWhere(
        contactInboxModel.lastOutboundMessageAt,
        operator,
        value,
        timezone,
      )

    case "lastInteraction":
      return buildLatestContactInboxDateWhere(
        contactInboxModel.lastIncomingMessageAt,
        operator,
        value,
        timezone,
      )

    case "lastInteractionMinutesAgo":
      return buildLatestContactInboxMinutesAgoWhere(
        contactInboxModel.lastIncomingMessageAt,
        operator,
        value,
      )

    case "lastUserInput":
      return buildLatestContactInboxTextWhere(
        contactInboxModel.lastUserInput,
        operator,
        value,
      )

    case "lastUserInputType":
      return buildLatestContactInboxTextWhere(
        contactInboxModel.lastUserInputType,
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

    case "hasContactInfo":
      return buildHasContactInfoWhere(operator, value)

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

    case "fromCtwaAd":
      return buildExistsBooleanWhere(
        contactInboxExists,
        sql`${contactInboxModel.referral}->>'ctwaClid' IS NOT NULL AND ${contactInboxModel.referral}->>'ctwaClid' <> ''`,
        operator,
        value,
      )

    case "ctwaRetarget": {
      const segment = condition.segment
      if (
        typeof segment !== "string" ||
        !(ctwaRetargetSegments as readonly string[]).includes(segment) ||
        typeof condition.since !== "string" ||
        typeof condition.until !== "string"
      ) {
        return {}
      }
      const { since, until } = ctwaRetargetDateRange(
        condition.since,
        condition.until,
      )
      return existsWhere((contactId) =>
        buildCtwaSegmentContactExists(
          {
            segment: segment as (typeof ctwaRetargetSegments)[number],
            adId: condition.adId,
            since,
            until,
            workspaceId: context.workspaceId,
            integrationWhatsappId: condition.integrationWhatsappId,
          },
          contactId,
        ),
      )
    }

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
    case "ctwaConversion":
      return buildRelationSetWhere(field, operator, value)

    case "questionnaireStarted":
      return buildExistsBooleanWhere(
        questionnaireSubmissionExists,
        sql`${questionnaireSubmissionModel.questionnaireId} IN (SELECT ${questionnaireModel.id} FROM ${questionnaireModel} WHERE ${questionnaireModel.workspaceId} = ${questionnaireSubmissionModel.workspaceId})`,
        operator,
        value,
      )

    case "questionnaireInProgress":
      return buildExistsBooleanWhere(
        questionnaireSubmissionExists,
        sql`${questionnaireSubmissionModel.status} = 'inProgress' AND ${questionnaireSubmissionModel.questionnaireId} IN (SELECT ${questionnaireModel.id} FROM ${questionnaireModel} WHERE ${questionnaireModel.workspaceId} = ${questionnaireSubmissionModel.workspaceId})`,
        operator,
        value,
      )

    case "questionnaireFinished":
      return buildExistsBooleanWhere(
        questionnaireSubmissionExists,
        sql`${questionnaireSubmissionModel.status} = 'completed' AND ${questionnaireSubmissionModel.questionnaireId} IN (SELECT ${questionnaireModel.id} FROM ${questionnaireModel} WHERE ${questionnaireModel.workspaceId} = ${questionnaireSubmissionModel.workspaceId})`,
        operator,
        value,
      )

    case "couponTopic":
      return buildCouponTopicWhere(condition.topicId, operator, value)

    case "conversationAssigned":
      return buildConversationAssignedWhere(operator, value)

    case "customField":
      return buildCustomFieldWhere({ ...condition, timezone })

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
