import type { AuditLogModel } from "@aha.chat/database/types"
import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const listAuditLogsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  keyword: parseAsString.withDefault(""),
  sort: getSortingStateParser<AuditLogModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  userId: parseAsString.withDefault(""),
})

export type ListAuditLogsRequest = Awaited<
  ReturnType<typeof listAuditLogsSearchParamsCache.parse>
> & {
  chatbotId: string
}
