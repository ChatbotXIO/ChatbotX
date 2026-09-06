import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getAdminWorkspacesSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  keyword: parseAsString,
})

export type ListAdminWorkspacesRequest = Awaited<
  ReturnType<typeof getAdminWorkspacesSearchParamsCache.parse>
>
