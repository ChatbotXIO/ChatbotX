"use client"

import { useTranslations } from "next-intl"
import { use, useMemo } from "react"
import { AuditLogsDataTable } from "@/enterprise/features/audit-logs/audit-logs-data-table"
import { AuditLogsFilterToolbar } from "@/enterprise/features/audit-logs/audit-logs-filter-toolbar"
import type { PaginatedResponse } from "@/features/common/schema/pagination"
import { getPlatformAuditColumns } from "./platform-audit-logs-table-columns"
import type {
  PlatformAuditLogResource,
  PlatformAuditWorkspaceOption,
} from "./schema"
import type { ListPlatformAuditLogsRequest } from "./schema/query"

type PlatformAuditLogsTableProps = {
  search: Pick<
    ListPlatformAuditLogsRequest,
    "from" | "to" | "keyword" | "workspaceId"
  >
  promises: Promise<
    [
      PaginatedResponse<PlatformAuditLogResource>,
      PlatformAuditWorkspaceOption[],
    ]
  >
}

export function PlatformAuditLogsTable({
  promises,
  search,
}: PlatformAuditLogsTableProps) {
  const t = useTranslations()
  const [{ data, pageCount }, workspaces] = use(promises)

  const columns = useMemo(() => getPlatformAuditColumns(t), [t])

  return (
    <div className="space-y-4">
      <AuditLogsDataTable
        columns={columns}
        data={data}
        pageCount={pageCount}
        toolbar={
          <AuditLogsFilterToolbar
            from={search.from}
            keyword={search.keyword}
            select={{
              paramKey: "workspaceId",
              value: search.workspaceId,
              label: t("fields.workspace.label"),
              allLabel: t("auditLogs.filters.allWorkspaces"),
              idPrefix: "platform-audit-log-workspace",
              options: workspaces.map((workspace) => ({
                id: workspace.id,
                label: workspace.label,
              })),
            }}
            to={search.to}
          />
        }
      />
    </div>
  )
}
