"use client"

import type { Table } from "@tanstack/react-table"
import { CreateReflinkDialog } from "./create-reflink"
import { DeleteReflinksDialog } from "./delete-reflinks"
import type { ListReflinkItem } from "./schemas/query"

type ReflinksTableToolbarActionsProps = {
  table: Table<ListReflinkItem>
  workspaceId: string
}

export function ReflinksTableToolbarActions({
  table,
  workspaceId,
}: ReflinksTableToolbarActionsProps) {
  return (
    <>
      <div className="flex items-center gap-2">
        {table.getFilteredSelectedRowModel().rows.length > 0 ? (
          <DeleteReflinksDialog
            onSuccess={() => table.toggleAllRowsSelected(false)}
            reflinks={table
              .getFilteredSelectedRowModel()
              .rows.map((row) => row.original)}
            workspaceId={workspaceId}
          />
        ) : null}
      </div>

      <CreateReflinkDialog workspaceId={workspaceId} />
    </>
  )
}
