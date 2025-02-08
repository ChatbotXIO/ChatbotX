"use client"

import { DeleteAiTriggerDialog } from "@/features/integrations/ai-triggers/delete"
import type { AiTrigger } from "@ahachat.ai/database"
import type { Table } from "@tanstack/react-table"

type AiTriggersTableToolbarActionsProps = {
  table: Table<AiTrigger>
  chatbotId: string
  onOpenChange: () => void
}

export function AiTriggersTableToolbarActions({
  table,
  chatbotId,
  onOpenChange,
}: AiTriggersTableToolbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteAiTriggerDialog
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
