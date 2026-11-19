import { createSearchParamsCache, parseAsInteger } from "nuqs/server"

/** URL state of the sync history page; runs are always newest first. */
export const listContactSyncHistorySearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
})
