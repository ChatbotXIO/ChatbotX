"use client"

import type { TagModel } from "@chatbotx.io/database/types"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import type { Table } from "@tanstack/react-table"
import { FolderUpIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { ChangeFolderDialog } from "../folders/change-folder"
import { DeleteTagsDialog } from "./delete-tag-dialog"

type TagsTableToolbarActionsProps = {
  table: Table<TagModel>
  workspaceId: string
}

export function TagsTableToolbarActions({
  table,
  workspaceId,
}: TagsTableToolbarActionsProps) {
  const t = useTranslations()
  const [openChangeFolder, setOpenChangeFolder] = useState(false)

  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <>
          <DeleteTagsDialog
            onSuccess={() => table.toggleAllRowsSelected(false)}
            tags={table
              .getFilteredSelectedRowModel()
              .rows.map((row) => row.original)}
            workspaceId={workspaceId}
          />
          <ChangeFolderDialog
            currentFolderId={null}
            folderType="tag"
            modelIds={table
              .getFilteredSelectedRowModel()
              .rows.map((row) => row.original.id)}
            onOpenChange={setOpenChangeFolder}
            open={openChangeFolder}
            trigger={
              <Button type="button" variant="outline">
                <FolderUpIcon aria-hidden="true" className="size-4" />
                {t("actions.move")}
              </Button>
            }
            workspaceId={workspaceId}
          />
        </>
      ) : null}
    </div>
  )
}
