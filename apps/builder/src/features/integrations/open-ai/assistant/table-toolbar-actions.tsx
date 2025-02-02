"use client"

import { DeleteAssistantDialog } from "@/features/integrations/open-ai/assistant/delete"
import type { Table } from "@tanstack/react-table"

type AgentsTableToolbarActionsProps = {
  table: Table<Record<string, string>>
  chatbotId: string
  onOpenChange: () => void
}

export function AssistantTableToolbarActions({
  table,
  chatbotId,
  onOpenChange,
}: AgentsTableToolbarActionsProps) {
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
