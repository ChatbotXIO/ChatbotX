"use client"

import type { Flow } from "@ahachat.ai/database"
import type { Table } from "@tanstack/react-table"
import { DeleteFlowsDialog } from "./delete-flow-dialog"

interface FlowsTableToolbarActionsProps {
  table: Table<Flow>
  chatbotId: string
}

export function FlowsTableToolbarActions({
  table,
  chatbotId,
}: FlowsTableToolbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteFlowsDialog
          flows={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
          onSuccess={() => table.toggleAllRowsSelected(false)}
          chatbotId={chatbotId}
        />
      ) : null}
    </div>
  )
}
