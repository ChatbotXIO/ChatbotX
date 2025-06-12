"use client"

import { useDataTable } from "@/hooks/use-data-table"
import type { Tag } from "@ahachat.ai/database/types"
import React, { useMemo } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { DeleteTagsDialog } from "./delete-tag-dialog"
import type { getTags } from "./queries"
import { getTagColumns } from "./tags-table-columns"
import { TagsTableToolbarActions } from "./tags-table-toolbar-actions"
import { UpdateTagDialog } from "./update-tag-dialog"
import type { DataTableRowAction } from "@/types/data-table"
import { DataTable } from "@/components/data-table"
import { DataTableToolbar } from "@/components/data-table-toolbar"

interface TagsTableProps {
  promises: Promise<[Awaited<ReturnType<typeof getTags>>]>
  chatbotId: string
}

export function TagsTable({ promises, chatbotId }: TagsTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const [rowAction, setRowAction] =
    React.useState<DataTableRowAction<Tag> | null>(null)
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
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
          <TagsTableToolbarActions table={table} chatbotId={chatbotId} />
        </DataTableToolbar>
      </DataTable>

      <DeleteTagsDialog
        open={rowAction?.variant === "delete"}
        onOpenChange={() => setRowAction(null)}
        tags={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        chatbotId={chatbotId}
      />

      <UpdateTagDialog
        open={rowAction?.variant === "update"}
        onOpenChange={() => setRowAction(null)}
        chatbotId={chatbotId}
        tag={rowAction?.row.original || null}
      />
    </>
  )
}
