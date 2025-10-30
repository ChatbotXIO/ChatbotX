"use client"

import { type FieldModel, FieldType } from "@aha.chat/database/types"
import type { Table } from "@tanstack/react-table"
import { DeleteFieldsDialog } from "./delete-fields-dialog"

type CustomFieldsTableToolbarActionsProps = {
  table: Table<FieldModel>
  chatbotId: string
  // setRowAction: React.Dispatch<
  //   React.SetStateAction<DataTableRowAction<FieldModel> | null>
  // >
}

export function CustomFieldsTableToolbarActions({
  table,
  chatbotId,
  // setRowAction,
}: CustomFieldsTableToolbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteFieldsDialog
          chatbotId={chatbotId}
          fieldType={FieldType.customField}
          onSuccess={() => table.toggleAllRowsSelected(false)}
          records={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
        />
      ) : null}
    </div>
  )
}
