"use client"

import { DeleteAIAgentsDialog } from "@/features/integrations/ai-agents/delete"
import type { AIAgent } from "@ahachat.ai/database/types"
import type { Table } from "@tanstack/react-table"

type AIAgentsTableToolbarActionsProps = {
  table: Table<AIAgent>
  chatbotId: string
  onOpenChange: () => void
}

export function AIAgentsTableToolbarActions({
  table,
  chatbotId,
  onOpenChange,
}: AIAgentsTableToolbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteAIAgentsDialog
          agents={table
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
