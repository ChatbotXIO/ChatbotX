import type { ContactFilterCriteria } from "@/features/contact-filter"
import { CONTACTS_DEFAULT_PER_PAGE } from "../constants"
import type { ListContactsRequest } from "../schema/query"
import { listContactsRequest } from "../schema/query"

const DEFAULT_CONTACTS_SORT = [{ id: "createdAt", desc: true }]

const urlListContactsRequest = listContactsRequest.pick({
  page: true,
  perPage: true,
  sort: true,
  keyword: true,
})

/**
 * Builds the contacts-table list request from the URL-owned table state
 * (page/perPage/sort/keyword) plus the locally-held contact filter.
 */
export const getContactsListInput = (
  workspaceId: string,
  searchParams: Record<string, string | string[] | undefined>,
  contactFilter: ContactFilterCriteria,
): ListContactsRequest & { page: number; perPage: number } => {
  const parsed = urlListContactsRequest.safeParse(searchParams)
  const parsedInput = parsed.success ? parsed.data : undefined

  return {
    workspaceId,
    page: parsedInput?.page ?? 1,
    perPage: parsedInput?.perPage ?? CONTACTS_DEFAULT_PER_PAGE,
    sort: parsedInput?.sort?.length ? parsedInput.sort : DEFAULT_CONTACTS_SORT,
    keyword: parsedInput?.keyword,
    contactFilter:
      contactFilter.conditions.length > 0 ? contactFilter : undefined,
  }
}
