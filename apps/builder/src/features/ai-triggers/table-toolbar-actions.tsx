"use client"

import type { AITriggerModel } from "@chatbotx.io/database/types"
import type { Table } from "@tanstack/react-table"
import { DeleteAITriggerDialog } from "@/features/ai-triggers/delete"

type AITriggersTableToolbarActionsProps = {
  table: Table<AITriggerModel>
  workspaceId: string
  onOpenChange: () => void
}

export function AITriggersTableToolbarActions({
  table,
  workspaceId,
  onOpenChange,
}: AITriggersTableToolbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteAITriggerDialog
          onOpenChange={onOpenChange}
          onSuccess={() => table.toggleAllRowsSelected(false)}
          trigger={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
          workspaceId={workspaceId}
        />
      ) : null}
    </div>
  )
}
