import type { ContactFilterCriteriaInput } from "@chatbotx.io/database/queries"
import { contactRepository } from "@chatbotx.io/database/repositories"
import type { ContactModel } from "@chatbotx.io/database/types"
import { getPaginationWithDefaults } from "@chatbotx.io/database/utils"
import { logger } from "../logger"
import type { ContactAccessScope } from "./service"
import { maskContactEmailAndPhone } from "./utils"

const CONTACTS_DEFAULT_PER_PAGE = 50
const CONTACT_LIST_COUNT_CAP = 10_000

export type ContactListScope = ContactAccessScope & {
  canViewEmailAndPhone: boolean
}

export type ContactListInclude =
  | "tags"
  | "customFields"
  | "inboxes"
  | "conversation"

export type ListContactsInput = {
  workspaceId: string
  keyword?: string
  contactFilter?: ContactFilterCriteriaInput
  page?: number | null
  perPage?: number | null
  sort?: { desc: boolean; id: string }[] | null
}

export type ContactListResult<T> = {
  data: T[]
  pageCount: number
  totalCount: number
  totalCountCapped: boolean
}

/**
 * The workspace-token (public API) surface is not scoped to a workspace
 * member: it sees full PII and every contact. Callers must opt out of member
 * scoping with this explicit literal rather than by omitting `scope`, so the
 * restriction can never be dropped by accident on a PII-bearing read.
 */
export const UNSCOPED = "unscoped" as const

type ContactListScopeInput = ContactListScope | typeof UNSCOPED

const resolveScope = (
  scope: ContactListScopeInput,
): ContactListScope | undefined => (scope === UNSCOPED ? undefined : scope)

type ListInput = ListContactsInput & {
  scope: ContactListScopeInput
  /** "table" mirrors the private RSC contacts-table relation set (no tags /
   * custom fields); "full" is the default public/API relation set. */
  projection?: "full" | "table"
  include?: readonly ContactListInclude[]
  withCount?: boolean
}

type CountInput = ListContactsInput & {
  scope: ContactListScopeInput
}

/**
 * `include`/`withCount` narrow the *response payload*, not the query —
 * Drizzle's relational query builder infers each row's type from the literal
 * `with` object at the call site, so a dynamically-built `with` would erase
 * that inference (every relation becomes optional/untyped). The DB still
 * joins every relation; this only strips fields the caller didn't ask for
 * before the response goes over the wire.
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

async function resolveCount(props: {
  withCount: boolean
  where: Record<string, unknown>
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

/**
 * The `getTotalContactsFromStats` shortcut used for the no-filter path is
 * deliberately an approximation (aggregated from `InboxContactStats`, not a
 * live COUNT) — folding it into every count call is a separate, measured
 * decision for the cache/perf pass.
 */
function toListWhereInput(
  input: ListContactsInput,
  scope: ContactListScope | undefined,
): Parameters<typeof contactRepository.buildListWhere>[0] {
  return {
    workspaceId: input.workspaceId,
    keyword: input.keyword,
    contactFilter: input.contactFilter,
    restrictToAssignedUserId: scope?.restrictToAssignedUserId,
    includeEmailAndPhone: scope?.canViewEmailAndPhone !== false,
  }
}

async function getTotalContactsFromStats(
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

export async function list<T extends ContactModel = ContactModel>(
  input: ListInput,
): Promise<ContactListResult<T>> {
  const { projection = "full", include, withCount = true } = input
  const scope = resolveScope(input.scope)
  const normalizedInput = {
    ...input,
    perPage: input.perPage ?? CONTACTS_DEFAULT_PER_PAGE,
  }

  const where = contactRepository.buildListWhere(toListWhereInput(input, scope))

  const pagination = getPaginationWithDefaults(normalizedInput)
  const orderBy = contactRepository.resolveOrderBy(normalizedInput)

  // `listForTable` is the "full" relation set minus tags/customFields — use
  // it whenever the caller can't need those two joins, either because the
  // table projection never returns them, or because `include` was given and
  // omits both.
  const skipsTagsAndCustomFields =
    !!include && !include.includes("tags") && !include.includes("customFields")
  const usesTableRelations = projection === "table" || skipsTagsAndCustomFields

  const [data, countResult] = await Promise.all([
    usesTableRelations
      ? contactRepository.listForTable({ where, ...pagination, orderBy })
      : contactRepository.listWithRelations({ where, ...pagination, orderBy }),
    resolveCount({ withCount, where }),
  ])

  const pageCount = withCount
    ? Math.ceil(countResult.total / pagination.limit)
    : 0

  // Unscoped (token) callers see PII; scoped members only when permitted.
  const maskedData =
    scope && !scope.canViewEmailAndPhone
      ? data.map(maskContactEmailAndPhone)
      : data
  const visibleData = include
    ? maskedData.map((contact) =>
        stripUnrequestedContactRelations(contact, include),
      )
    : maskedData

  return {
    data: visibleData as T[],
    pageCount,
    totalCount: countResult.total,
    totalCountCapped: countResult.capped,
  }
}

export async function count(input: CountInput): Promise<{ total: number }> {
  const scope = resolveScope(input.scope)
  if (
    !(input.keyword || input.contactFilter || scope?.restrictToAssignedUserId)
  ) {
    return getTotalContactsFromStats(input.workspaceId)
  }

  const where = contactRepository.buildListWhere(toListWhereInput(input, scope))

  const total = await contactRepository.count({ where })
  return { total }
}

export async function listByCustomFieldValue(input: {
  workspaceId: string
  customFieldId: string
  value: string
}) {
  const { workspaceId, customFieldId, value } = input
  const where: Record<string, unknown> = { workspaceId }
  if (customFieldId === "email") {
    where.email = value
  } else if (customFieldId === "phone") {
    where.phoneNumber = value
  } else {
    where.contactCustomFields = { customFieldId, value }
  }

  return await contactRepository.listPublicByCustomField({
    where,
    limit: 100,
    orderBy: { updatedAt: "desc" },
  })
}
