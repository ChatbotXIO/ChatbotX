"use client"

import type { DataTableRowAction } from "@/components/data-table/types"
import { type Field, FieldType } from "@ahachat.ai/database/browser"
import type { Table } from "@tanstack/react-table"
import { DeleteFieldsDialog } from "./delete-fields-dialog"

interface CustomFieldsTableToolbarActionsProps {
  table: Table<Field>
  chatbotId: string
  setRowAction: React.Dispatch<
    React.SetStateAction<DataTableRowAction<Field> | null>
  >
}

export function CustomFieldsTableToolbarActions({
  table,
  chatbotId,
  setRowAction,
}: CustomFieldsTableToolbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteFieldsDialog
          fields={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
          onSuccess={() => table.toggleAllRowsSelected(false)}
          chatbotId={chatbotId}
          onOpenChange={() => setRowAction(null)}
          fieldType={FieldType.CUSTOM_FIELD}
        />
      ) : null}
    </div>
  )
}
