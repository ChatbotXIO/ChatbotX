"use client"

import type { RefLinkModel } from "@aha.chat/database/types"
import type { Table } from "@tanstack/react-table"
import { DeleteRefLinksDialog } from "./delete-ref-links-dialog"

type RefLinksTableToolbarActionsProps = {
  table: Table<RefLinkModel>
  chatbotId: string
}

export function RefLinksTableToolbarActions({
  table,
  chatbotId,
}: RefLinksTableToolbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteRefLinksDialog
          chatbotId={chatbotId}
          onSuccess={() => table.toggleAllRowsSelected(false)}
          refLinks={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
        />
      ) : null}
    </div>
  )
}
