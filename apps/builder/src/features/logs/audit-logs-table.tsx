"use client"

import { DataTable } from "@/components/data-table/data-table"
import type {
  DataTableFilterField,
  DataTableRowAction,
} from "@/components/data-table/types"
import { useDataTable } from "@/hooks/use-data-table"
import type { Log } from "@ahachat.ai/database/browser"
import React from "react"
import { getAuditColumns } from "./audit-logs-table-columns"
import type { getLogs } from "./queries"

interface LogsTableProps {
  promises: Promise<[Awaited<ReturnType<typeof getLogs>>]>
  // chatbotId: string
}

export function AuditLogsTable({ promises }: LogsTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const [_rowAction, setRowAction] =
    React.useState<DataTableRowAction<Log> | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const columns = React.useMemo(() => getAuditColumns(), [setRowAction])

  const filterFields: DataTableFilterField<Log & { action?: string }>[] = [
    {
      id: "action",
      label: "Search",
      placeholder: "Enter Action name...",
    },
  ]

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    filterFields,
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
