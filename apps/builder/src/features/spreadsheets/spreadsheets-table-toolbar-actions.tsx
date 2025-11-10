"use client"

import type { SpreadsheetModel } from "@aha.chat/database/types"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { Table } from "@tanstack/react-table"
import type { Dispatch, SetStateAction } from "react"
import { DeleteSpreadsheetsDialog } from "./delete-spreadsheet-dialog"

type SpreadsheetsTableToolbarActionsProps = {
  table: Table<SpreadsheetModel>
  chatbotId: string
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<SpreadsheetModel> | null>
  >
}

export function SpreadsheetsTableToolbarActions({
  table,
  chatbotId,
  setRowAction,
}: SpreadsheetsTableToolbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteSpreadsheetsDialog
          chatbotId={chatbotId}
          onOpenChange={() => setRowAction(null)}
          onSuccess={() => table.toggleAllRowsSelected(false)}
          spreadsheets={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
        />
      ) : null}
    </div>
  )
}
