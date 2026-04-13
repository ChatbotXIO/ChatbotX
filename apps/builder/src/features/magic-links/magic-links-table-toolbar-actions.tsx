"use client"

import type { Table } from "@tanstack/react-table"
import { CreateMagicLinkDialog } from "./create-magic-link"
import { DeleteMagicLinksDialog } from "./delete-magic-links"
import type { ListMagicLinkItem } from "./schemas/query"

type MagicLinksTableToolbarActionsProps = {
  table: Table<ListMagicLinkItem>
  workspaceId: string
}

export const MagicLinksTableToolbarActions = ({
  table,
  workspaceId,
}: MagicLinksTableToolbarActionsProps) => {
  return (
    <>
      <div className="flex items-center gap-2">
        {table.getFilteredSelectedRowModel().rows.length > 0 ? (
          <DeleteMagicLinksDialog
            magicLinks={table
              .getFilteredSelectedRowModel()
              .rows.map((row) => row.original)}
            onSuccess={() => table.toggleAllRowsSelected(false)}
            workspaceId={workspaceId}
          />
        ) : null}
      </div>

      <CreateMagicLinkDialog workspaceId={workspaceId} />
    </>
  )
}
