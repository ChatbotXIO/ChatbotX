import type { AuditLogModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import type { ExtendedColumnSort } from "@chatbotx.io/ui/types/data-table"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import { getDefaultAuditLogsRange } from "@/enterprise/features/audit-logs/schema/query"

export { parseAuditLogsDateRange } from "@/enterprise/features/audit-logs/schema/query"

const defaultRange = getDefaultAuditLogsRange()

export const listPlatformAuditLogsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  from: parseAsString.withDefault(defaultRange.from),
  to: parseAsString.withDefault(defaultRange.to),
  keyword: parseAsString.withDefault(""),
  sort: getSortingStateParser<AuditLogModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  workspaceId: parseAsString.withDefault(""),
})

export type ListPlatformAuditLogsRequest = {
  page: number
  perPage: number
  from: string
  to: string
  keyword: string
  sort: ExtendedColumnSort<AuditLogModel>[]
  workspaceId: string
}
