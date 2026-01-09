"use client"

import type { TriggerModel } from "@aha.chat/database/types"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { Table } from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import type { Dispatch, SetStateAction } from "react"

import { DeleteTriggersDialog } from "./delete-triggers-dialog"

type TriggersTableToolbarActionsProps = {
  table: Table<TriggerModel>
  chatbotId: string
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<TriggerModel> | null>
  >
}

export function TriggersTableToolbarActions({
  table,
  chatbotId,
  setRowAction,
}: TriggersTableToolbarActionsProps) {
  const router = useRouter()

  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteTriggersDialog
          chatbotId={chatbotId}
          onOpenChange={() => setRowAction(null)}
          onSuccess={() => {
            table.toggleAllRowsSelected(false)
            router.refresh()
          }}
          triggers={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
        />
      ) : null}
    </div>
  )
}
