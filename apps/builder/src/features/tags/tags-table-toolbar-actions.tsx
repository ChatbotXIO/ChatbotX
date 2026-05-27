"use client"

import type { TagModel } from "@chatbotx.io/database/types"
import type { Table } from "@tanstack/react-table"
import { DeleteTagsDialog } from "./delete-tag-dialog"

type TagWithCount = TagModel & { contactsCount?: number | null }

type TagsTableToolbarActionsProps = {
  table: Table<TagWithCount>
  workspaceId: string
}

/**
 * Toolbar quando há linhas selecionadas — só Excluir.
 * Pedro removeu o conceito de pasta de /tags em 2026-05-23, então o botão
 * "Mover" + ChangeFolderDialog foram removidos junto (não faz sentido mover
 * pra pasta se a UI de pasta não existe mais).
 */
export function TagsTableToolbarActions({
  table,
  workspaceId,
}: TagsTableToolbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteTagsDialog
          onSuccess={() => table.toggleAllRowsSelected(false)}
          tags={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
          workspaceId={workspaceId}
        />
      ) : null}
    </div>
  )
}
