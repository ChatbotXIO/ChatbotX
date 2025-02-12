"use client"

import { DeleteAssistantDialog } from "@/features/integrations/ai-assistants/delete"
import type { AIAssistant } from "@ahachat.ai/database"
import type { Table } from "@tanstack/react-table"

type AIAgentsTableToolbarActionsProps = {
  table: Table<AIAssistant>
  chatbotId: string
  onOpenChange: () => void
}

export function AIAssistantTableToolbarActions({
  table,
  chatbotId,
  onOpenChange,
}: AIAgentsTableToolbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteAssistantDialog
          assistant={table
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
