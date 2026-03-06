"use client"

import type { TagModel } from "@aha.chat/database/types"
import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import { useTranslations } from "next-intl"
import React, { useMemo } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { ChangeFolderDialog } from "../folders/change-folder"
import { DeleteTagsDialog } from "./delete-tag-dialog"
import type { listTags } from "./queries"
import { getTagColumns } from "./tags-table-columns"
import { TagsTableToolbarActions } from "./tags-table-toolbar-actions"
import { UpdateTagDialog } from "./update-tag-dialog"

type TagsTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listTags>>]>
  chatbotId: string
}

export function TagsTable({ promises, chatbotId }: TagsTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const [rowAction, setRowAction] =
    React.useState<DataTableRowAction<TagModel> | null>(null)
  const [_, copy] = useCopyToClipboard()
  const t = useTranslations()

  const handleCopy = (id: string) => {
    copy(id)
      .then(() => {
        toast.success("Copied to clipboard!")
      })
      .catch(() => {
        toast.error("Failed to copy!")
      })
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: we need to memoize the columns
  const columns = useMemo(
    () => getTagColumns({ setRowAction, handleCopy, t }),
    [],
  )

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

      <ChangeFolderDialog
        chatbotId={chatbotId}
        currentFolderId={rowAction?.row.original?.folderId || null}
        folderType="tag"
        modelIds={rowAction?.row.original ? [rowAction?.row.original.id] : null}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "move"}
      />
    </>
  )
}
