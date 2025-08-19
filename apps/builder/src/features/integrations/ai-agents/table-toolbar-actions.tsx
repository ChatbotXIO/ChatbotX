"use client"

import type { AIAgentModel } from "@aha.chat/database/types"
import type { Table } from "@tanstack/react-table"
import { DeleteAIAgentsDialog } from "@/features/integrations/ai-agents/delete"

type AIAgentsTableToolbarActionsProps = {
  table: Table<AIAgentModel>
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
          chatbotId={chatbotId}
          onOpenChange={onOpenChange}
          onSuccess={() => table.toggleAllRowsSelected(false)}
        />
      ) : null}
    </div>
  )
}
