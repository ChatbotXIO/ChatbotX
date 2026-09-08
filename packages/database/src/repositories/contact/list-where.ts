import {
  applyContactFilter,
  buildSmartKeywordWhere,
  pruneEmailPhoneFilterConditions,
} from "../../queries"
import type { ContactFilterCriteriaInput } from "../../queries/contact-filter/types"
import { contactModel } from "../../schema"
import { parseOrderByAsObject } from "../../utils"

/**
 * Matches the client's default sort (`contacts-table.tsx` initialState).
 * `sort` is dropped from the URL whenever it equals that default
 * (`clearOnDefault: true`), so requests with no `sort` param must still
 * resolve to this same order instead of skipping ORDER BY entirely.
 */
export const DEFAULT_CONTACT_ORDER_BY = { createdAt: "desc" } as const

type ContactWhere = Record<string, unknown>

type ListWhereInput = {
  workspaceId: string
  keyword?: string
  contactFilter?: ContactFilterCriteriaInput
  restrictToAssignedUserId?: string
  includeEmailAndPhone: boolean
}

const hasWhereParts = (where: ContactWhere): boolean =>
  Object.keys(where).length > 0

export function resolveContactOrderBy(input: {
  sort?: { desc: boolean; id: string }[] | null
}): Record<string, unknown> {
  const orderBy = parseOrderByAsObject(contactModel, input)
  return Object.keys(orderBy).length > 0 ? orderBy : DEFAULT_CONTACT_ORDER_BY
}

/**
 * Pure where-builder for the contacts list/count/search surfaces (private
 * RSC, workspace-token public API, and any future caller). No cache, no I/O.
 */
export function buildContactListWhere(input: ListWhereInput): ContactWhere {
  const where: ContactWhere = {
    workspaceId: input.workspaceId,
  }

  const contactFilter = pruneEmailPhoneFilterConditions(
    input.contactFilter,
    input.includeEmailAndPhone,
  )

  const filters = [
    input.keyword
      ? buildSmartKeywordWhere(input.keyword, {
          includeEmailAndPhone: input.includeEmailAndPhone,
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

  if (input.restrictToAssignedUserId) {
    const conversation =
      typeof where.conversation === "object" &&
      where.conversation !== null &&
      !Array.isArray(where.conversation)
        ? where.conversation
        : {}

    where.conversation = {
      ...conversation,
      assignedUserId: input.restrictToAssignedUserId,
    }
  }

  return where
}
