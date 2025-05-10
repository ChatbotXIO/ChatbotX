"use client"

import { DeleteAITriggerDialog } from "@/features/integrations/ai-triggers/delete"
import type { AITrigger } from "@ahachat.ai/database/types"
import type { Table } from "@tanstack/react-table"

type AITriggersTableToolbarActionsProps = {
  table: Table<AITrigger>
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
          trigger={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
          onSuccess={() => table.toggleAllRowsSelected(false)}
          chatbotId={chatbotId}
          onOpenChange={onOpenChange}
        />
      ) : null}
    </div>
  )
}
