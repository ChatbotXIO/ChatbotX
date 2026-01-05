"use client"

import type { TriggerModel } from "@aha.chat/database/types"
import type { Table } from "@tanstack/react-table"
import { DeleteTriggersDialog } from "./delete-triggers-dialog"

type TriggersTableToolbarActionsProps = {
  table: Table<TriggerModel>
  chatbotId: string
}

export function TriggersTableToolbarActions({
  table,
  chatbotId,
}: TriggersTableToolbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteTriggersDialog
          chatbotId={chatbotId}
          onSuccess={() => table.toggleAllRowsSelected(false)}
          triggers={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
        />
      ) : null}
    </div>
  )
}
