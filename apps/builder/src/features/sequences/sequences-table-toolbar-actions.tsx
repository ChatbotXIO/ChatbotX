"use client"

import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { Table } from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import type { Dispatch, SetStateAction } from "react"
import { BulkDeleteSequenceDialog } from "./bulk-delete-sequence-dialog"
import { BulkMoveFolderDialog } from "./bulk-move-folder-dialog"
import { AddSequenceButton } from "./components/add-sequence-button"
import type { ListSequencesItem } from "./schema"

type SequencesTableToolbarActionsProps = {
  chatbotId: string
  table: Table<ListSequencesItem>
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<ListSequencesItem> | null>
  >
}

export function SequencesTableToolbarActions({
  chatbotId,
  table,
  setRowAction,
}: SequencesTableToolbarActionsProps) {
  const router = useRouter()

  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <>
          <BulkMoveFolderDialog
            chatbotId={chatbotId}
            onOpenChange={() => setRowAction(null)}
            onSuccess={() => {
              table.toggleAllRowsSelected(false)
              router.refresh()
            }}
            sequences={table
              .getFilteredSelectedRowModel()
              .rows.map((row) => row.original)}
          />
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
        </>
      ) : null}
      <AddSequenceButton />
    </div>
  )
}
