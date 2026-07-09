import { ChatbotXException } from "@chatbotx.io/business/errors"
import { countWithRelationsFilter, db } from "@chatbotx.io/database/client"
import { applyContactFilter } from "@chatbotx.io/database/queries"
import { contactModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { logger } from "@/lib/log"
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
  const scope = scopeInput === "unscoped" ? undefined : scopeInput
  const where = generateWhere(input, scope)

  const pagination = getPaginationWithDefaults(input)
  const orderBy = resolveOrderBy(input)

  const [data, totalRows] = await Promise.all([
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
    countWithRelationsFilter({
      table: contactModel,
      tsName: "contactModel",
      where,
    }),
  ])

  const pageCount = Math.ceil(totalRows / pagination.limit)
  // Unscoped (token) callers see PII; scoped members only when permitted.
  const visibleData =
    scope && !scope.canViewEmailAndPhone
      ? data.map(maskContactEmailAndPhone)
      : data

  return { data: visibleData, pageCount }
}

export async function listContactsRSC(
  input: ListContactsRequest & { workspaceId: string },
): Promise<ListContactsResponse> {
  const scope = await requireContactPermissionScope(input.workspaceId)

  const where = generateWhere(input, scope)

  const pagination = getPaginationWithDefaults(input)
  const orderBy = resolveOrderBy(input)

  const [data, totalRows] = await Promise.all([
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
    countWithRelationsFilter({
      table: contactModel,
      tsName: "contactModel",
      where,
    }),
  ])

  const pageCount = Math.ceil(totalRows / pagination.limit)
  const visibleData = scope.canViewEmailAndPhone
    ? data
    : data.map(maskContactEmailAndPhone)

  return { data: visibleData, pageCount }
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
  const keyword = input.keyword?.toLowerCase()
  const where: Record<string, unknown> = {
    workspaceId: input.workspaceId,
    ...(keyword
      ? {
          OR: [
            { firstName: { ilike: `%${keyword}%` } },
            { lastName: { ilike: `%${keyword}%` } },
            ...(scope?.canViewEmailAndPhone === false
              ? []
              : [
                  { email: { ilike: `%${keyword}%` } },
                  { phoneNumber: { ilike: `%${keyword}%` } },
                ]),
          ],
        }
      : {}),
  }

  if (input.contactFilter) {
    Object.assign(where, applyContactFilter(input.contactFilter))
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
