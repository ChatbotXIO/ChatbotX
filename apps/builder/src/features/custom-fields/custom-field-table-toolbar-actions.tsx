"use client"

import type { FieldModel } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import type { Table } from "@tanstack/react-table"
import { FolderUpIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { ChangeFolderDialog } from "../folders/change-folder"
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
  const t = useTranslations()
  const [openChangeFolder, setOpenChangeFolder] = useState(false)

  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <>
          <DeleteFieldsDialog
            chatbotId={chatbotId}
            onSuccess={() => table.toggleAllRowsSelected(false)}
            records={table
              .getFilteredSelectedRowModel()
              .rows.map((row) => row.original)}
          />
          <ChangeFolderDialog
            chatbotId={chatbotId}
            currentFolderId={null}
            folderType="customField"
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
