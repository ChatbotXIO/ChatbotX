import type { MiniAppModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const listMiniAppsSearchParams = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  keyword: parseAsString,
  sort: getSortingStateParser<MiniAppModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
}
export const listMiniAppsSearchParamsCache = createSearchParamsCache(
  listMiniAppsSearchParams,
)

export type ListMiniAppsRequest = Awaited<
  ReturnType<typeof listMiniAppsSearchParamsCache.parse>
> & { workspaceId: string }

export const listMiniAppSubmissionsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(20),
})
