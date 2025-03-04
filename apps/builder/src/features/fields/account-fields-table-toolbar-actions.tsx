"use client"

import { type Field, FieldType } from "@ahachat.ai/database/browser"
import type { Table } from "@tanstack/react-table"
import type { DataTableRowAction } from "./account-field-table-columns"
import { DeleteFieldsDialog } from "./delete-fields-dialog"

interface AccountFieldsTableToolbarActionsProps {
  table: Table<Field>
  chatbotId: string
  setRowAction: React.Dispatch<
    React.SetStateAction<DataTableRowAction<Field> | null>
  >
}

export function AccountFieldsTableToolbarActions({
  table,
  chatbotId,
  setRowAction,
}: AccountFieldsTableToolbarActionsProps) {
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
          fieldType={FieldType.ACCOUNT_FIELD}
        />
      ) : null}
    </div>
  )
}
