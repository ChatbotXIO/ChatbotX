"use client"

import { DeleteAssistantDialog } from "@/features/integrations/open-ai/ai-assistants/delete"
import type { AiAssistant } from "@ahachat.ai/database"
import type { Table } from "@tanstack/react-table"

type AiAgentsTableToolbarActionsProps = {
  table: Table<AiAssistant>
  chatbotId: string
  onOpenChange: () => void
}

export function AiAssistantTableToolbarActions({
  table,
  chatbotId,
  onOpenChange,
}: AiAgentsTableToolbarActionsProps) {
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
