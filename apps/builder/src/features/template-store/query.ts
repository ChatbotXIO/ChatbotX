import {
  TEMPLATE_STORE_MAX_LISTINGS,
  templateStoreListingStatuses,
} from "@chatbotx.io/database/partials"
import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

/**
 * The admin table's URL state. The toolbar's status select writes its value as
 * a list, so `status` arrives as an array (the first wins); the category chips
 * write a single `categoryId`.
 */
export const getTemplateStoreSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  keyword: parseAsString,
  categoryId: parseAsString,
  status: parseAsArrayOf(parseAsString),
})

export type TemplateStoreSearch = Awaited<
  ReturnType<typeof getTemplateStoreSearchParamsCache.parse>
>

const MAX_PER_PAGE = 50
const MAX_KEYWORD_LENGTH = 100

/** Search params made safe for the service: clamped paging, a trimmed keyword, a known status. */
export const toTemplateStoreListInput = (search: TemplateStoreSearch) => {
  const status = templateStoreListingStatuses.safeParse(search.status?.[0])
  return {
    // The store holds at most this many templates, so no real page is further out.
    page: Math.min(TEMPLATE_STORE_MAX_LISTINGS, Math.max(1, search.page)),
    perPage: Math.min(MAX_PER_PAGE, Math.max(1, search.perPage)),
    keyword: search.keyword?.trim().slice(0, MAX_KEYWORD_LENGTH) || undefined,
    categoryId: search.categoryId || undefined,
    status: status.success ? status.data : undefined,
  }
}
