"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import { useTranslations } from "next-intl"
import { use, useMemo } from "react"
import { getAuditColumns } from "./audit-logs-table-columns"
import { AuditLogsToolbar } from "./audit-logs-toolbar"
import type { listAuditLogAdmins, listAuditLogs } from "./queries"
import type { ListAuditLogsRequest } from "./schemas/query"

type AuditLogsTableProps = {
  workspaceId: string
  search: Pick<ListAuditLogsRequest, "from" | "to" | "keyword" | "userId">
  promises: Promise<
    [
      Awaited<ReturnType<typeof listAuditLogs>>,
      Awaited<ReturnType<typeof listAuditLogAdmins>>,
    ]
  >
}

export function AuditLogsTable({ promises, search }: AuditLogsTableProps) {
  const t = useTranslations()
  const [{ data, pageCount }, admins] = use(promises)

  const columns = useMemo(() => getAuditColumns(t), [t])

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
      <h3 className="font-bold text-xl">{t("auditLogs.title")}</h3>

      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <AuditLogsToolbar {...search} admins={admins} />
        </DataTableToolbar>
      </DataTable>
    </div>
  )
}
