"use client"

import type { Tag } from "@ahachat.ai/database/types"
import type { Table } from "@tanstack/react-table"
import { DeleteTagsDialog } from "./delete-tag-dialog"

interface TagsTableToolbarActionsProps {
  table: Table<Tag>
  chatbotId: string
}

export function TagsTableToolbarActions({
  table,
  chatbotId,
}: TagsTableToolbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteTagsDialog
          tags={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
          onSuccess={() => table.toggleAllRowsSelected(false)}
          chatbotId={chatbotId}
          onOpenChange={() => {}}
        />
      ) : null}
    </div>
  )
}
