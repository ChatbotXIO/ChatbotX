"use client"

import type { TagModel } from "@aha.chat/database/types"
import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import React, { useMemo } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { DeleteTagsDialog } from "./delete-tag-dialog"
import type { getTags } from "./queries"
import { getTagColumns } from "./tags-table-columns"
import { TagsTableToolbarActions } from "./tags-table-toolbar-actions"
import { UpdateTagDialog } from "./update-tag-dialog"

type TagsTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof getTags>>]>
  chatbotId: string
}

export function TagsTable({ promises, chatbotId }: TagsTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const [rowAction, setRowAction] =
    React.useState<DataTableRowAction<TagModel> | null>(null)
  const [_, copy] = useCopyToClipboard()

  const handleCopy = (id: string) => {
    copy(id)
      .then(() => {
        toast.success("Copied to clipboard!")
      })
      .catch(() => {
        toast.error("Failed to copy!")
      })
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: wip
  const columns = useMemo(() => getTagColumns({ setRowAction, handleCopy }), [])

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <TagsTableToolbarActions chatbotId={chatbotId} table={table} />
        </DataTableToolbar>
      </DataTable>

      <DeleteTagsDialog
        chatbotId={chatbotId}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        open={rowAction?.variant === "delete"}
        showTrigger={false}
        tags={rowAction?.row.original ? [rowAction?.row.original] : []}
      />

      <UpdateTagDialog
        chatbotId={chatbotId}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "update"}
        tag={rowAction?.row.original || null}
      />
    </>
  )
}
