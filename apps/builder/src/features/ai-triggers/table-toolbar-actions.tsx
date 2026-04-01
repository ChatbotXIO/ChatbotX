"use client"

import type { AITriggerModel } from "@chatbotx.io/database/types"
import type { Table } from "@tanstack/react-table"
import { DeleteAITriggerDialog } from "@/features/ai-triggers/delete"

type AITriggersTableToolbarActionsProps = {
  table: Table<AITriggerModel>
  chatbotId: bigint
  onOpenChange: () => void
}

export function AITriggersTableToolbarActions({
  table,
  chatbotId,
  onOpenChange,
}: AITriggersTableToolbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteAITriggerDialog
          chatbotId={chatbotId}
          onOpenChange={onOpenChange}
          onSuccess={() => table.toggleAllRowsSelected(false)}
          trigger={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
        />
      ) : null}
    </div>
  )
}
