"use client"

import type { ErrorLogModel } from "@chatbotx.io/database/types"
import type { Table } from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import { DeleteErrorLogsDialog } from "./delete-error-logs"

type ErrorLogsTableToolbarActionsProps = {
  table: Table<ErrorLogModel>
  chatbotId: bigint
}

export function ErrorLogsTableToolbarActions({
  table,
  chatbotId,
}: ErrorLogsTableToolbarActionsProps) {
  const router = useRouter()

  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteErrorLogsDialog
          chatbotId={chatbotId}
          errorLogs={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
          onSuccess={() => {
            table.toggleAllRowsSelected(false)
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}
