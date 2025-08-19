"use client"

import type { AITriggerModel } from "@aha.chat/database/types"
import type { Table } from "@tanstack/react-table"
import { DeleteAITriggerDialog } from "@/features/integrations/ai-triggers/delete"

type AITriggersTableToolbarActionsProps = {
  table: Table<AITriggerModel>
  chatbotId: string
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
