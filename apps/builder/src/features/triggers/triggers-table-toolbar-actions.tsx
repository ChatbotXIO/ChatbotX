"use client"

import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { Table } from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import type { Dispatch, SetStateAction } from "react"
import { CreateTriggerDialog } from "./create-trigger-dialog"
import { DeleteTriggersDialog } from "./delete-triggers-dialog"
import type { TriggerResource } from "./schema/resource"

type TriggersTableToolbarActionsProps = {
  table: Table<TriggerResource>
  workspaceId: string
  folderId: string | null
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<TriggerResource> | null>
  >
}

export function TriggersTableToolbarActions({
  table,
  workspaceId,
  folderId,
  setRowAction,
}: TriggersTableToolbarActionsProps) {
  const router = useRouter()

  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteTriggersDialog
          onOpenChange={() => setRowAction(null)}
          onSuccess={() => {
            table.toggleAllRowsSelected(false)
            router.refresh()
          }}
          triggers={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
          workspaceId={workspaceId}
        />
      ) : null}

      <CreateTriggerDialog folderId={folderId} workspaceId={workspaceId} />
    </div>
  )
}
