"use client"

import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { Table } from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import type { Dispatch, SetStateAction } from "react"
import { BulkDeleteSequenceDialog } from "./bulk-delete-sequence-dialog"
import { BulkMoveFolderDialog } from "./bulk-move-folder-dialog"
import { AddSequenceButton } from "./components/add-sequence-button"
import type { ListSequencesResponse } from "./schema/action"

type SequencesTableToolbarActionsProps = {
  workspaceId: string
  table: Table<ListSequencesResponse["data"][number]>
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<
      ListSequencesResponse["data"][number]
    > | null>
  >
}

export function SequencesTableToolbarActions({
  workspaceId,
  table,
  setRowAction,
}: SequencesTableToolbarActionsProps) {
  const router = useRouter()

  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <>
          <BulkDeleteSequenceDialog
            onOpenChange={() => setRowAction(null)}
            onSuccess={() => {
              table.toggleAllRowsSelected(false)
              router.refresh()
            }}
            sequences={table
              .getFilteredSelectedRowModel()
              .rows.map((row) => row.original)}
          />
          <BulkMoveFolderDialog
            onOpenChange={() => setRowAction(null)}
            onSuccess={() => {
              table.toggleAllRowsSelected(false)
              router.refresh()
            }}
            sequences={table
              .getFilteredSelectedRowModel()
              .rows.map((row) => row.original)}
            workspaceId={workspaceId}
          />
        </>
      ) : null}
      <AddSequenceButton />
    </div>
  )
}
