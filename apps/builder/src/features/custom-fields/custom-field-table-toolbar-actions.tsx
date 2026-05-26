"use client"

import type { Table } from "@tanstack/react-table"
import { DeleteFieldsDialog } from "./delete-fields-dialog"
import type { CustomFieldResource } from "./schemas/resource"

type CustomFieldsTableToolbarActionsProps = {
  table: Table<CustomFieldResource>
  workspaceId: string
}

/**
 * Toolbar quando há linhas selecionadas — só Excluir.
 * Pedro removeu o conceito de pasta de /custom-fields em 2026-05-23, então
 * o botão "Mover" + ChangeFolderDialog foram removidos junto.
 */
export function CustomFieldsTableToolbarActions({
  table,
  workspaceId,
}: CustomFieldsTableToolbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteFieldsDialog
          onSuccess={() => table.toggleAllRowsSelected(false)}
          records={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
          workspaceId={workspaceId}
        />
      ) : null}
    </div>
  )
}
