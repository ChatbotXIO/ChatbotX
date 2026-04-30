"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import type { Table } from "@tanstack/react-table"
import { FolderUpIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { ChangeFolderDialog } from "../folders/change-folder"
import { DeleteAutomatedResponsesDialog } from "./delete-automated-response-dialog"
import type { AutomatedResponseResource } from "./schema/resource"

type AutomatedResponseTableToolbarActionsProps = {
  table: Table<AutomatedResponseResource>
  workspaceId: string
}

export function AutomatedResponseTableToolbarActions({
  table,
  workspaceId,
}: AutomatedResponseTableToolbarActionsProps) {
  const t = useTranslations()
  const router = useRouter()
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false)
  const [openChangeFolder, setOpenChangeFolder] = useState(false)

  const selectedRows = table.getFilteredSelectedRowModel().rows

  if (selectedRows.length === 0) {
    return null
  }

  return (
    <div className="flex items-center gap-2">
      <DeleteAutomatedResponsesDialog
        automatedResponses={selectedRows.map((row) => row.original)}
        onOpenChange={setOpenDeleteDialog}
        onSuccess={() => {
          table.toggleAllRowsSelected(false)
          router.refresh()
        }}
        open={openDeleteDialog}
        workspaceId={workspaceId}
      />
      <ChangeFolderDialog
        currentFolderId={null}
        folderType="automatedResponse"
        modelIds={selectedRows.map((row) => row.original.id)}
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
    </div>
  )
}
