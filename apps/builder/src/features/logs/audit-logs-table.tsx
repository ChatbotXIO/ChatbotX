"use client"

import type { LogModel } from "@aha.chat/database/types"
import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import React from "react"
import { getAuditColumns } from "./audit-logs-table-columns"
import type { getLogs } from "./queries"

type LogsTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof getLogs>>]>
}

export function AuditLogsTable({ promises }: LogsTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const [_rowAction, setRowAction] =
    React.useState<DataTableRowAction<LogModel> | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: wip
  const columns = React.useMemo(() => getAuditColumns(), [setRowAction])

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return <DataTable table={table} />
}
