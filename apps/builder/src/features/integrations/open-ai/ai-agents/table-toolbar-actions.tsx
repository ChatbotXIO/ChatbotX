"use client"

import { DeleteAiAgentsDialog } from "@/features/integrations/open-ai/ai-agents/delete"
import type { AiAgent } from "@ahachat.ai/database"
import type { Table } from "@tanstack/react-table"

type AiAgentsTableToolbarActionsProps = {
  table: Table<AiAgent>
  chatbotId: string
  onOpenChange: () => void
}

export function AiAgentsTableToolbarActions({
  table,
  chatbotId,
  onOpenChange,
}: AiAgentsTableToolbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteAiAgentsDialog
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
