"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import { useTranslations } from "next-intl"
import { use, useMemo } from "react"
import type { PaginatedResponse } from "@/features/common/schema/pagination"
import { getPlatformAuditColumns } from "./platform-audit-logs-table-columns"
import { PlatformAuditLogsToolbar } from "./platform-audit-logs-toolbar"
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

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <div className="space-y-4">
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <PlatformAuditLogsToolbar {...search} workspaces={workspaces} />
        </DataTableToolbar>
      </DataTable>
    </div>
  )
}
