"use client"

import type { FlowModel } from "@aha.chat/database/types"
import type { Table } from "@tanstack/react-table"
import { DeleteFlowsDialog } from "./delete-flow-dialog"
import type { Dispatch, SetStateAction } from "react"
import type { DataTableRowAction } from "@/types/data-table"

interface FlowsTableToolbarActionsProps {
  table: Table<FlowModel>
  chatbotId: string
  setRowAction: Dispatch<SetStateAction<DataTableRowAction<FlowModel> | null>>
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
