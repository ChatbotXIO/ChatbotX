import type { ContactFilterCriteria } from "@/features/contact-filter"
import { CONTACTS_DEFAULT_PER_PAGE } from "../constants"
import type { ListContactsRequest } from "../schema/query"
import { listContactsRequest } from "../schema/query"

const DEFAULT_CONTACTS_SORT = [{ id: "createdAt", desc: true }]

export const getContactsListInput = (
  workspaceId: string,
  searchParams: Record<string, string | string[] | undefined>,
  contactFilter?: ContactFilterCriteria,
): ListContactsRequest => {
  const parsed = listContactsRequest
    .omit({ workspaceId: true })
    .safeParse(searchParams)
  const parsedInput = parsed.success ? parsed.data : undefined
  const resolvedContactFilter = contactFilter ?? parsedInput?.contactFilter

  const contactFilterConditions = resolvedContactFilter?.conditions ?? []
  return {
    workspaceId,
    page: parsedInput?.page ?? 1,
    perPage: parsedInput?.perPage ?? CONTACTS_DEFAULT_PER_PAGE,
    sort:
      parsedInput?.sort && parsedInput.sort.length > 0
        ? parsedInput.sort
        : DEFAULT_CONTACTS_SORT,
    keyword: parsedInput?.keyword,
    contactFilter:
      contactFilterConditions.length > 0 ? resolvedContactFilter : undefined,
  }
}
