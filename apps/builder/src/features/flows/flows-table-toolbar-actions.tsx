"use client"

import type { Flow } from "@ahachat.ai/database/browser"
import type { Table } from "@tanstack/react-table"
import { DeleteFlowsDialog } from "./delete-flow-dialog"
import type { DataTableRowAction } from "./flows-table-columns"

interface FlowsTableToolbarActionsProps {
  table: Table<Flow>
  chatbotId: string
  setRowAction: React.Dispatch<
    React.SetStateAction<DataTableRowAction<Flow> | null>
  >
}

export function FlowsTableToolbarActions({
  table,
  chatbotId,
  setRowAction,
}: FlowsTableToolbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteFlowsDialog
          flows={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
          onSuccess={() => table.toggleAllRowsSelected(false)}
          onOpenChange={() => setRowAction(null)}
          chatbotId={chatbotId}
        />
      ) : null}
    </div>
  )
}
