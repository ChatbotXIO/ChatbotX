import { createSearchParamsCache, parseAsString } from "nuqs/server"
import { auditLogsBaseSearchParams } from "@/enterprise/features/audit-logs/schema/query"

export const listPlatformAuditLogsSearchParamsCache = createSearchParamsCache({
  ...auditLogsBaseSearchParams,
  workspaceId: parseAsString.withDefault(""),
})

export type ListPlatformAuditLogsRequest = Awaited<
  ReturnType<typeof listPlatformAuditLogsSearchParamsCache.parse>
>
