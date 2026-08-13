import { type AnyColumn, inArray, type SQL, sql } from "drizzle-orm"
import { operatorTypes } from "../../partials"
import {
  adsConversionEventModel,
  contactInboxModel,
  contactsOnBroadcastsModel,
  contactsOnSequenceModel,
  contactsToTagsModel,
  refLinkStatModel,
} from "../../schema"
import { contactInboxExists, existsWhere, joinTableExists } from "./exists"
import type { ContactWhere, RelationExists } from "./types"

const tagsExists = joinTableExists(
  contactsToTagsModel,
  contactsToTagsModel.contactId,
)
const contactOnBroadcastExists = joinTableExists(
  contactsOnBroadcastsModel,
  contactsOnBroadcastsModel.contactId,
)
const contactOnSequenceExists = joinTableExists(
  contactsOnSequenceModel,
  contactsOnSequenceModel.contactId,
)
const refLinkStatExists = joinTableExists(
  refLinkStatModel,
  refLinkStatModel.contactId,
)

// AdsConversionEvent has no contactId column — it correlates to a contact via
// ContactInbox.contactInboxId, so this joins through ContactInbox instead of
// using joinTableExists (which only supports a single-table EXISTS).
const adsConversionEventExists: RelationExists = (predicate, negate = false) =>
  existsWhere(
    (contactId) =>
      predicate
        ? sql`SELECT 1 FROM ${adsConversionEventModel} INNER JOIN ${contactInboxModel} ON ${contactInboxModel.id} = ${adsConversionEventModel.contactInboxId} WHERE ${contactInboxModel.contactId} = ${contactId} AND ${predicate}`
        : sql`SELECT 1 FROM ${adsConversionEventModel} INNER JOIN ${contactInboxModel} ON ${contactInboxModel.id} = ${adsConversionEventModel.contactInboxId} WHERE ${contactInboxModel.contactId} = ${contactId}`,
    negate,
  )

const RELATION_SET_OPERATORS = new Set<string>([
  operatorTypes.enum.in,
  operatorTypes.enum.notIn,
  operatorTypes.enum.eq,
  operatorTypes.enum.ne,
  operatorTypes.enum.isEmpty,
])

type RelationSetFilter = {
  exists: RelationExists
  column: AnyColumn
  hasValuePredicate?: SQL
  extraPredicate?: SQL
}

const combinePredicates = (
  ...predicates: Array<SQL | undefined>
): SQL | undefined => {
  const presentPredicates = predicates.filter(
    (predicate): predicate is SQL => predicate !== undefined,
  )
  if (presentPredicates.length === 0) {
    return
  }

  return presentPredicates
    .slice(1)
    .reduce(
      (combined, predicate) => sql`${combined} AND ${predicate}`,
      presentPredicates[0],
    )
}

const RELATION_SET_FILTERS: Record<string, RelationSetFilter> = {
  source: { exists: contactInboxExists, column: contactInboxModel.source },
  currentChannel: {
    exists: contactInboxExists,
    column: contactInboxModel.channel,
  },
  inbox: { exists: contactInboxExists, column: contactInboxModel.inboxId },
  language: {
    exists: contactInboxExists,
    column: contactInboxModel.language,
    hasValuePredicate: sql`${contactInboxModel.language} IS NOT NULL AND ${contactInboxModel.language} <> ''`,
  },
  tags: { exists: tagsExists, column: contactsToTagsModel.tagId },
  broadcastSent: {
    exists: contactOnBroadcastExists,
    column: contactsOnBroadcastsModel.broadcastId,
    extraPredicate: sql`${contactsOnBroadcastsModel.sent} = true`,
  },
  broadcastDelivered: {
    exists: contactOnBroadcastExists,
    column: contactsOnBroadcastsModel.broadcastId,
    extraPredicate: sql`${contactsOnBroadcastsModel.deliveredAt} IS NOT NULL`,
  },
  broadcastSeen: {
    exists: contactOnBroadcastExists,
    column: contactsOnBroadcastsModel.broadcastId,
    extraPredicate: sql`${contactsOnBroadcastsModel.seenAt} IS NOT NULL`,
  },
  broadcastClicked: {
    exists: contactOnBroadcastExists,
    column: contactsOnBroadcastsModel.broadcastId,
    extraPredicate: sql`${contactsOnBroadcastsModel.clickedAt} IS NOT NULL`,
  },
  broadcastFailed: {
    exists: contactOnBroadcastExists,
    column: contactsOnBroadcastsModel.broadcastId,
    extraPredicate: sql`${contactsOnBroadcastsModel.failedAt} IS NOT NULL`,
  },
  subscribedToDripCampaign: {
    exists: contactOnSequenceExists,
    column: contactsOnSequenceModel.sequenceId,
  },
  entryPointsLinks: {
    exists: refLinkStatExists,
    column: refLinkStatModel.linkId,
  },
  ctwaConversion: {
    exists: adsConversionEventExists,
    column: adsConversionEventModel.eventType,
  },
}

const toArrayValue = (value: unknown): string[] =>
  Array.isArray(value) ? (value as string[]) : [value as string]

export function buildRelationSetWhere(
  field: string,
  operator: string,
  value: unknown,
): ContactWhere {
  const filter = RELATION_SET_FILTERS[field]
  if (!(filter && RELATION_SET_OPERATORS.has(operator))) {
    return {}
  }

  if (operator === operatorTypes.enum.isEmpty) {
    return filter.exists(
      combinePredicates(filter.hasValuePredicate, filter.extraPredicate),
      true,
    )
  }

  const values = toArrayValue(value)
  const positive =
    operator === operatorTypes.enum.in || operator === operatorTypes.enum.eq
  return filter.exists(
    combinePredicates(inArray(filter.column, values), filter.extraPredicate),
    !positive,
  )
}
