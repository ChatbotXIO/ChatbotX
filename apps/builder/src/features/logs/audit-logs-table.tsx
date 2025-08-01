"use client"

import { DataTable } from "@/components/data-table"
import { useDataTable } from "@/hooks/use-data-table"
import type { DataTableRowAction } from "@/types/data-table"
import type { LogModel } from "@aha.chat/database/types"
import React from "react"
import { getAuditColumns } from "./audit-logs-table-columns"
import type { getLogs } from "./queries"

interface LogsTableProps {
  promises: Promise<[Awaited<ReturnType<typeof getLogs>>]>
}

export function AuditLogsTable({ promises }: LogsTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const [_rowAction, setRowAction] =
    React.useState<DataTableRowAction<LogModel> | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
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

  return (
    <>
      <DataTable table={table} />
    </>
  )
}
