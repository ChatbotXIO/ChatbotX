import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getSubAccountWorkspacesSearchParamsCache = createSearchParamsCache(
  {
    page: parseAsInteger.withDefault(1),
    perPage: parseAsInteger.withDefault(10),
    keyword: parseAsString,
  },
)

export type ListSubAccountWorkspacesRequest = Awaited<
  ReturnType<typeof getSubAccountWorkspacesSearchParamsCache.parse>
>
