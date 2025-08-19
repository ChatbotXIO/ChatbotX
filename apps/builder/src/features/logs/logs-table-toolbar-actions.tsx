"use client"

import type { LogModel } from "@aha.chat/database/types"
import type { Table } from "@tanstack/react-table"
import { DeleteLogsDialog } from "./delete-logs-dialog"

type LogsTableToolbarActionsProps = {
  table: Table<LogModel>
  chatbotId: string
  logType: string
}

export function LogsTableToolbarActions({
  table,
  chatbotId,
  logType,
}: LogsTableToolbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteLogsDialog
          chatbotId={chatbotId}
          logs={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
          logType={logType}
          onSuccess={() => table.toggleAllRowsSelected(false)}
        />
      ) : null}
    </div>
  )
}
