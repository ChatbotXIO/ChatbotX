"use client"

import type { TagModel } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import type { Table } from "@tanstack/react-table"
import { FolderUpIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { ChangeFolderDialog } from "../folders/change-folder"
import { DeleteTagsDialog } from "./delete-tag-dialog"

type TagsTableToolbarActionsProps = {
  table: Table<TagModel>
  chatbotId: string
}

export function TagsTableToolbarActions({
  table,
  chatbotId,
}: TagsTableToolbarActionsProps) {
  const t = useTranslations()
  const [openChangeFolder, setOpenChangeFolder] = useState(false)

  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <>
          <DeleteTagsDialog
            chatbotId={chatbotId}
            onSuccess={() => table.toggleAllRowsSelected(false)}
            tags={table
              .getFilteredSelectedRowModel()
              .rows.map((row) => row.original)}
          />
          <ChangeFolderDialog
            chatbotId={chatbotId}
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
          />
        </>
      ) : null}
    </div>
  )
}
