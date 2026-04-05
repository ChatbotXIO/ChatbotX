import type { ErrorLogModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const listErrorLogsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  keyword: parseAsString.withDefault(""),
  sort: getSortingStateParser<ErrorLogModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export type ListErrorLogsRequest = Awaited<
  ReturnType<typeof listErrorLogsSearchParamsCache.parse>
> & {
  workspaceId: string
}
