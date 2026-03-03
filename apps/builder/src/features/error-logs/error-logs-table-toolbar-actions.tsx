"use client"

import type { ErrorLogModel } from "@aha.chat/database/types"
import type { Table } from "@tanstack/react-table"
import { DeleteErrorLogsDialog } from "./delete-error-logs"

type ErrorLogsTableToolbarActionsProps = {
  table: Table<ErrorLogModel>
  chatbotId: string
}

export function ErrorLogsTableToolbarActions({
  table,
  chatbotId,
}: ErrorLogsTableToolbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteErrorLogsDialog
          chatbotId={chatbotId}
          errorLogs={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
          onSuccess={() => table.toggleAllRowsSelected(false)}
        />
      ) : null}
    </div>
  )
}
