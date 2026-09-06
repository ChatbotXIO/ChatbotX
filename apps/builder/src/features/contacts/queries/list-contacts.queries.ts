import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  applyContactFilter,
  buildSmartKeywordWhere,
  pruneEmailPhoneFilterConditions,
} from "@chatbotx.io/database/queries"
import { contactRepository } from "@chatbotx.io/database/repositories"
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
import type { ListContactsRequest, ListContactsResponse } from "../schema/query"

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

/**
 * `include`/`withCount` are only honored on the token (public API) surface —
 * `listContacts` above (RSC/private) always uses the full relation set and a
 * real count so private behavior never silently changes shape.
 */
export type ListContactsForAPIOptions = {
  include?: readonly ("tags" | "customFields" | "inboxes" | "conversation")[]
  withCount?: boolean
}

/**
 * `include` narrows the *response payload*, not the query — Drizzle's
 * relational query builder infers each row's type from the literal `with`
 * object at the call site, so a dynamically-built `with` would erase that
 * inference (every relation becomes optional/untyped). The DB still joins
 * every relation; this only strips fields the caller didn't ask for before
 * the response goes over the wire, which is still the main token-surface win
 * (smaller payload while scanning many contacts) even though it doesn't skip
 * work in Postgres. A query-level version is a bigger, separate change if the
 * join cost itself needs cutting.
 */
function stripUnrequestedContactRelations<
  T extends {
    tags?: unknown
    contactCustomFields?: unknown
    contactInboxes?: unknown
    conversation?: unknown
  },
>(contact: T, include: readonly string[] | undefined): T {
  if (!include) {
    return contact
  }
  const selected = new Set(include)
  const result = { ...contact }
  if (!selected.has("tags")) {
    result.tags = undefined
  }
  if (!selected.has("customFields")) {
    result.contactCustomFields = undefined
  }
  if (!selected.has("inboxes")) {
    result.contactInboxes = undefined
  }
  if (!selected.has("conversation")) {
    result.conversation = undefined
  }
  return result
}

export function listContactsForAPI(
  input: ListContactsRequest,
  options?: ListContactsForAPIOptions,
): Promise<ListContactsResponse> {
  // Workspace-token surface: not scoped to a workspace member. Callers must opt
  // out of member scoping explicitly so it can never be dropped by accident.
  return queryContacts(input, "unscoped", options)
}

/**
 * The `getTotalContactsFromStats` shortcut `countContacts` uses for the
 * no-filter private path is deliberately NOT reused here — it's an
 * approximation (aggregated from `InboxContactStats`, not a live COUNT) and
 * folding it into the token surface's default count is a separate,
 * measured decision for the cache/perf pass, not something to change as a
 * side effect of adding `withCount`. `withCount: false` is the intended way
 * for a caller to skip the count entirely.
 */
async function resolveContactCount(props: {
  withCount: boolean
  where: ReturnType<typeof generateWhere>
}): Promise<{ total: number; capped: boolean }> {
  const { withCount, where } = props
  if (!withCount) {
    return { total: 0, capped: false }
  }
  return await contactRepository.countCapped({
    cap: CONTACT_LIST_COUNT_CAP,
    where,
  })
}

async function queryContacts(
  input: ListContactsRequest,
  scopeInput: ContactPermissionScope | "unscoped",
  options?: ListContactsForAPIOptions,
): Promise<ListContactsResponse> {
  const normalizedInput = {
    ...input,
    perPage: input.perPage ?? CONTACTS_DEFAULT_PER_PAGE,
  }
  const scope = scopeInput === "unscoped" ? undefined : scopeInput
  const where = generateWhere(normalizedInput, scope)

  const pagination = getPaginationWithDefaults(normalizedInput)
  const orderBy = resolveOrderBy(normalizedInput)
  const withCount = options?.withCount ?? true

  const [data, countResult] = await Promise.all([
    contactRepository.listWithRelations({ where, ...pagination, orderBy }),
    resolveContactCount({ withCount, where }),
  ])

  const pageCount = withCount
    ? Math.ceil(countResult.total / pagination.limit)
    : 0
  // Unscoped (token) callers see PII; scoped members only when permitted.
  const maskedData =
    scope && !scope.canViewEmailAndPhone
      ? data.map(maskContactEmailAndPhone)
      : data
  const visibleData = options?.include
    ? maskedData.map((contact) =>
        stripUnrequestedContactRelations(contact, options.include),
      )
    : maskedData

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
    contactRepository.listForTable({ where, ...pagination, orderBy }),
    contactRepository.countCapped({
      cap: CONTACT_LIST_COUNT_CAP,
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

  const total = await contactRepository.count({
    where,
  })
  return { total }
}

export async function getTotalContactsFromStats(
  workspaceId: string,
): Promise<{ total: number }> {
  try {
    const total =
      await contactRepository.sumTotalContactsFromInboxStats(workspaceId)
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

export async function countContactsForAPI(
  input: ListContactsRequest,
): Promise<{ total: number }> {
  if (!(input.keyword || input.contactFilter)) {
    return getTotalContactsFromStats(input.workspaceId)
  }
  const total = await contactRepository.count({ where: generateWhere(input) })
  return { total }
}
