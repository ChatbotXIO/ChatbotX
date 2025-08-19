"use client"

import type { FlowModel } from "@aha.chat/database/types"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { Table } from "@tanstack/react-table"
import type { Dispatch, SetStateAction } from "react"
import { DeleteFlowsDialog } from "./delete-flow-dialog"

type FlowsTableToolbarActionsProps = {
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
          chatbotId={chatbotId}
          flows={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
          onOpenChange={() => setRowAction(null)}
          onSuccess={() => table.toggleAllRowsSelected(false)}
        />
      ) : null}
    </div>
  )
}
