"use client"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import type {
  DataTableFilterField,
  DataTableRowAction,
} from "@/components/data-table/types"
import { useDataTable } from "@/hooks/use-data-table"
import type { Tag } from "@ahachat.ai/database/browser"
import React, { useMemo } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { DeleteTagsDialog } from "./delete-tag-dialog"
import type { getTags } from "./queries"
import { getTagColumns } from "./tags-table-columns"
import { TagsTableToolbarActions } from "./tags-table-toolbar-actions"
import { UpdateTagDialog } from "./update-tag-dialog"

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
  const columns = useMemo(
    () => getTagColumns({ setRowAction, handleCopy }),
    [setRowAction],
  )

  const filterFields: DataTableFilterField<Tag & { name?: string }>[] = [
    {
      id: "name",
      label: "Search",
      placeholder: "Enter tags name...",
    },
  ]

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    filterFields,
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
        <DataTableToolbar table={table} filterFields={filterFields}>
          <TagsTableToolbarActions table={table} chatbotId={chatbotId} />
        </DataTableToolbar>
      </DataTable>

      <DeleteTagsDialog
        open={rowAction?.type === "delete"}
        onOpenChange={() => setRowAction(null)}
        tags={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        chatbotId={chatbotId}
      />

      <UpdateTagDialog
        open={rowAction?.type === "update"}
        onOpenChange={() => setRowAction(null)}
        chatbotId={chatbotId}
        tag={rowAction?.row.original || null}
      />
    </>
  )
}
