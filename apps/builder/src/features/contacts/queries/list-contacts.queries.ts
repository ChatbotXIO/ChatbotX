import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  countWithRelationsFilter,
  countWithRelationsFilterCapped,
  db,
} from "@chatbotx.io/database/client"
import {
  applyContactFilter,
  buildSmartKeywordWhere,
  pruneEmailPhoneFilterConditions,
} from "@chatbotx.io/database/queries"
import { contactModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { logger } from "@/lib/log"
import { CONTACTS_DEFAULT_PER_PAGE } from "../constants"
import {
  type ContactPermissionScope,
  maskContactEmailAndPhone,
  resolveContactPermissionScope,
} from "../permissions"
import type {
  ListContactsRequest,
  ListContactsResponse,
} from "../schemas/query"

/**
 * Matches the client's default sort (`contacts-table.tsx` initialState).
 * `sort` is dropped from the URL whenever it equals that default
 * (`clearOnDefault: true`), so requests with no `sort` param must still
 * resolve to this same order instead of skipping ORDER BY entirely.
 */
const DEFAULT_ORDER_BY = { createdAt: "desc" } as const
const CONTACT_LIST_COUNT_CAP = 10_000
type ContactWhere = Record<string, unknown>

const hasWhereParts = (where: ContactWhere): boolean =>
  Object.keys(where).length > 0

export function resolveOrderBy(input: ListContactsRequest) {
  const orderBy = parseOrderByAsObject(contactModel, input)
  return Object.keys(orderBy).length > 0 ? orderBy : DEFAULT_ORDER_BY
}

export async function listContacts(
  input: ListContactsRequest,
): Promise<ListContactsResponse> {
  const scope = await requireContactPermissionScope(input.workspaceId)
  return queryContacts(input, scope)
}

export function listContactsForAPI(
  input: ListContactsRequest,
): Promise<ListContactsResponse> {
  // Workspace-token surface: not scoped to a workspace member. Callers must opt
  // out of member scoping explicitly so it can never be dropped by accident.
  return queryContacts(input, "unscoped")
}

async function queryContacts(
  input: ListContactsRequest,
  scopeInput: ContactPermissionScope | "unscoped",
): Promise<ListContactsResponse> {
  const normalizedInput = {
    ...input,
    perPage: input.perPage ?? CONTACTS_DEFAULT_PER_PAGE,
  }
  const scope = scopeInput === "unscoped" ? undefined : scopeInput
  const where = generateWhere(normalizedInput, scope)

  const pagination = getPaginationWithDefaults(normalizedInput)
  const orderBy = resolveOrderBy(normalizedInput)

  const [data, countResult] = await Promise.all([
    db.query.contactModel.findMany({
      where,
      ...pagination,
      orderBy,
      with: {
        tags: true,
        contactCustomFields: true,
        contactInboxes: {
          with: {
            inbox: true,
          },
        },
        conversation: {
          with: {
            assignedUser: true,
            assignedInboxTeam: true,
          },
        },
      },
    }),
    countWithRelationsFilterCapped({
      cap: CONTACT_LIST_COUNT_CAP,
      table: contactModel,
      tsName: "contactModel",
      where,
    }),
  ])

  const pageCount = Math.ceil(countResult.total / pagination.limit)
  // Unscoped (token) callers see PII; scoped members only when permitted.
  const visibleData =
    scope && !scope.canViewEmailAndPhone
      ? data.map(maskContactEmailAndPhone)
      : data

  return {
    data: visibleData,
    pageCount,
    totalCount: countResult.total,
    totalCountCapped: countResult.capped,
  }
}

export async function listContactsRSC(
  input: ListContactsRequest & { workspaceId: string },
): Promise<ListContactsResponse> {
  const scope = await requireContactPermissionScope(input.workspaceId)
  const normalizedInput = {
    ...input,
    perPage: input.perPage ?? CONTACTS_DEFAULT_PER_PAGE,
  }

  const where = generateWhere(normalizedInput, scope)

  const pagination = getPaginationWithDefaults(normalizedInput)
  const orderBy = resolveOrderBy(normalizedInput)

  const [data, countResult] = await Promise.all([
    db.query.contactModel.findMany({
      where,
      ...pagination,
      orderBy,
      with: {
        contactInboxes: {
          with: {
            inbox: true,
          },
        },
        conversation: {
          with: {
            assignedUser: true,
            assignedInboxTeam: true,
            // inbox: true,
          },
        },
      },
    }),
    countWithRelationsFilterCapped({
      cap: CONTACT_LIST_COUNT_CAP,
      table: contactModel,
      tsName: "contactModel",
      where,
    }),
  ])

  const pageCount = Math.ceil(countResult.total / pagination.limit)
  const visibleData = scope.canViewEmailAndPhone
    ? data
    : data.map(maskContactEmailAndPhone)

  return {
    data: visibleData,
    pageCount,
    totalCount: countResult.total,
    totalCountCapped: countResult.capped,
  }
}

export async function countContacts(
  input: ListContactsRequest,
): Promise<{ total: number }> {
  const scope = await requireContactPermissionScope(input.workspaceId)

  if (
    !(input.keyword || input.contactFilter || scope.restrictToAssignedUserId)
  ) {
    return getTotalContactsFromStats(input.workspaceId)
  }

  const where = generateWhere(input, scope)

  const total = await countWithRelationsFilter({
    table: contactModel,
    tsName: "contactModel",
    where,
  })
  return { total }
}

async function getTotalContactsFromStats(
  workspaceId: string,
): Promise<{ total: number }> {
  try {
    const inboxes = await db.query.inboxModel.findMany({
      where: { workspaceId },
      with: {
        contactStats: true,
      },
    })

    const total = inboxes.reduce(
      (sum, inbox) => sum + (inbox.contactStats?.totalContacts ?? 0),
      0,
    )

    return { total }
  } catch (error) {
    logger.error({ err: error }, "Error getting total contacts from stats")
    return { total: 0 }
  }
}

async function requireContactPermissionScope(
  workspaceId: string,
): Promise<ContactPermissionScope> {
  const scope = await resolveContactPermissionScope(workspaceId)
  if (!scope) {
    throw new ChatbotXException("User is not associated with this workspace")
  }

  return scope
}

export const generateWhere = (
  input: ListContactsRequest,
  scope?: ContactPermissionScope,
) => {
  const where: ContactWhere = {
    workspaceId: input.workspaceId,
  }

  const contactFilter = pruneEmailPhoneFilterConditions(
    input.contactFilter,
    scope?.canViewEmailAndPhone !== false,
  )

  const filters = [
    input.keyword
      ? buildSmartKeywordWhere(input.keyword, {
          includeEmailAndPhone: scope?.canViewEmailAndPhone !== false,
        })
      : undefined,
    contactFilter
      ? applyContactFilter(contactFilter, input.workspaceId)
      : undefined,
  ].filter((filter): filter is ContactWhere =>
    filter ? hasWhereParts(filter) : false,
  )

  if (filters.length === 1) {
    Object.assign(where, filters[0])
  } else if (filters.length > 1) {
    where.AND = filters
  }

  if (scope?.restrictToAssignedUserId) {
    const conversation =
      typeof where.conversation === "object" &&
      where.conversation !== null &&
      !Array.isArray(where.conversation)
        ? where.conversation
        : {}

    where.conversation = {
      ...conversation,
      assignedUserId: scope.restrictToAssignedUserId,
    }
  }

  return where
}
