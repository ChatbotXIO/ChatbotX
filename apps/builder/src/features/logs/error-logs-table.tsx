"use client"

import { type LogModel, LogType } from "@aha.chat/database/types"
import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import { DeleteLogsDialog } from "./delete-logs-dialog"
import { getColumns } from "./error-logs-table-columns"
import { LogsTableToolbarActions } from "./logs-table-toolbar-actions"
import type { getLogs } from "./queries"

type LogsTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof getLogs>>]>
  chatbotId: string
}

export function ErrorLogsTable({ promises, chatbotId }: LogsTableProps) {
  const t = useTranslations()
  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<LogModel> | null>(null)

  const columns = useMemo(() => getColumns({ setRowAction, t }), [t])

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
            chatbotId={chatbotId}
            logType={LogType.error}
            table={table}
          />
        </DataTableToolbar>
      </DataTable>

      <DeleteLogsDialog
        chatbotId={chatbotId}
        logs={rowAction?.row.original ? [rowAction?.row.original] : []}
        logType={LogType.error}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        open={rowAction?.variant === "delete"}
        showTrigger={false}
      />
    </>
  )
}
