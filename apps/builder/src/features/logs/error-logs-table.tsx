"use client"

import React, { useMemo, useState } from "react"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import type {
  DataTableFilterField,
  DataTableRowAction,
} from "@/components/data-table/types"
import { useDataTable } from "@/hooks/use-data-table"
import { type Log, LogType } from "@ahachat.ai/database"
import { DeleteLogsDialog } from "./delete-logs-dialog"
import { getColumns } from "./error-logs-table-columns"
import { LogsTableToolbarActions } from "./logs-table-toolbar-actions"
import type { getLogs } from "./queries"

interface LogsTableProps {
  promises: Promise<[Awaited<ReturnType<typeof getLogs>>]>
  chatbotId: string
}

export function ErrorLogsTable({ promises, chatbotId }: LogsTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const [rowAction, setRowAction] = useState<DataTableRowAction<Log> | null>(
    null,
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const columns = useMemo(() => getColumns({ setRowAction }), [setRowAction])

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
      <DataTable table={table}>
        <DataTableToolbar table={table} filterFields={filterFields}>
          <LogsTableToolbarActions
            table={table}
            chatbotId={chatbotId}
            logType={LogType.Error}
          />
        </DataTableToolbar>
      </DataTable>

      <DeleteLogsDialog
        open={rowAction?.type === "delete"}
        onOpenChange={() => setRowAction(null)}
        logs={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        chatbotId={chatbotId}
        logType={LogType.Error}
      />
    </>
  )
}
