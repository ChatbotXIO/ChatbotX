"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { ColumnDef } from "@tanstack/react-table"
import type { ReactNode } from "react"

type AuditLogRow = { id: string; createdAt: unknown }

type AuditLogsDataTableProps<TData extends AuditLogRow> = {
  data: TData[]
  pageCount: number
  columns: ColumnDef<TData>[]
  toolbar: ReactNode
}

export function AuditLogsDataTable<TData extends AuditLogRow>({
  data,
  pageCount,
  columns,
  toolbar,
}: AuditLogsDataTableProps<TData>) {
  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [
        { id: "createdAt" as Extract<keyof TData, string>, desc: true },
      ],
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table}>{toolbar}</DataTableToolbar>
    </DataTable>
  )
}
