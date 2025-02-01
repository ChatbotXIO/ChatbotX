"use client"

import { DeleteAgentsDialog } from "@/features/integrations/open-ai/agents/delete"
import type { Table } from "@tanstack/react-table"

type AgentsTableToolbarActionsProps = {
  table: Table<Record<string, string>>
  chatbotId: string
}

export function AgentsTableToolbarActions({
  table,
  chatbotId,
}: AgentsTableToolbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteAgentsDialog
          agents={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
          onSuccess={() => table.toggleAllRowsSelected(false)}
          chatbotId={chatbotId}
        />
      ) : null}
    </div>
  )
}
