"use client"

import { type Table } from "@tanstack/react-table"
import { DeleteLogsDialog } from "./delete-logs-dialog"
import { Log } from "@prisma/client"

interface LogsTableToolbarActionsProps {
  table: Table<Log>
  chatbotId: string
}

export function LogsTableToolbarActions({
  table, chatbotId
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
        />
      ) : null}
    </div>
  )
}
