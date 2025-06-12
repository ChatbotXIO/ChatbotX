"use client"

import { useMemo, useState, use } from "react"
import { useDataTable } from "@/hooks/use-data-table"
import { type Log, LogType } from "@ahachat.ai/database/types"
import { DeleteLogsDialog } from "./delete-logs-dialog"
import { getColumns } from "./error-logs-table-columns"
import { LogsTableToolbarActions } from "./logs-table-toolbar-actions"
import type { getLogs } from "./queries"
import type { DataTableRowAction } from "@/types/data-table"
import { DataTable } from "@/components/data-table"
import { DataTableToolbar } from "@/components/data-table-toolbar"

interface LogsTableProps {
  promises: Promise<[Awaited<ReturnType<typeof getLogs>>]>
  chatbotId: string
}

export function ErrorLogsTable({ promises, chatbotId }: LogsTableProps) {
  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] = useState<DataTableRowAction<Log> | null>(
    null,
  )

  const columns = useMemo(() => getColumns({ setRowAction }), [])

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
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <LogsTableToolbarActions
            table={table}
            chatbotId={chatbotId}
            logType={LogType.Error}
          />
        </DataTableToolbar>
      </DataTable>

      <DeleteLogsDialog
        open={rowAction?.variant === "delete"}
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
