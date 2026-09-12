"use client"

import type { Table } from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import { DeleteErrorLogsDialog } from "./delete-error-logs"
import type { ErrorLogResource } from "./schema"

type ErrorLogsTableToolbarActionsProps = {
  table: Table<ErrorLogResource>
  workspaceId: string
}

export function ErrorLogsTableToolbarActions({
  table,
  workspaceId,
}: ErrorLogsTableToolbarActionsProps) {
  const router = useRouter()

  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteErrorLogsDialog
          errorLogs={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
          onSuccess={() => {
            table.toggleAllRowsSelected(false)
            router.refresh()
          }}
          workspaceId={workspaceId}
        />
      ) : null}
    </div>
  )
}
