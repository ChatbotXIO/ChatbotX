"use client"

import type { Log } from "@ahachat.ai/database/types"
import type { Table } from "@tanstack/react-table"
import { DeleteLogsDialog } from "./delete-logs-dialog"

interface LogsTableToolbarActionsProps {
  table: Table<Log>
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
          logs={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
          onSuccess={() => table.toggleAllRowsSelected(false)}
          chatbotId={chatbotId}
          logType={logType}
        />
      ) : null}
    </div>
  )
}
