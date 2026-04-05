"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import type { Table } from "@tanstack/react-table"
import { FolderUpIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { ChangeFolderDialog } from "../folders/change-folder"
import { DeleteFieldsDialog } from "./delete-fields-dialog"
import type { CustomFieldResource } from "./schemas/resource"

type CustomFieldsTableToolbarActionsProps = {
  table: Table<CustomFieldResource>
  workspaceId: string
}

export function CustomFieldsTableToolbarActions({
  table,
  workspaceId,
  // setRowAction,
}: CustomFieldsTableToolbarActionsProps) {
  const t = useTranslations()
  const [openChangeFolder, setOpenChangeFolder] = useState(false)

  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <>
          <DeleteFieldsDialog
            onSuccess={() => table.toggleAllRowsSelected(false)}
            records={table
              .getFilteredSelectedRowModel()
              .rows.map((row) => row.original)}
            workspaceId={workspaceId}
          />
          <ChangeFolderDialog
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
            workspaceId={workspaceId}
          />
        </>
      ) : null}
    </div>
  )
}
