"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { Table } from "@tanstack/react-table"
import { FolderUpIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { type Dispatch, type SetStateAction, useState } from "react"
import { ChangeFolderDialog } from "../folders/change-folder"
import { CreateTriggerDialog } from "./create-trigger-dialog"
import { DeleteTriggersDialog } from "./delete-triggers-dialog"
import type { TriggerResource } from "./schema/resource"

type TriggersTableToolbarActionsProps = {
  table: Table<TriggerResource>
  workspaceId: string
  folderId: string | null
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<TriggerResource> | null>
  >
}

export function TriggersTableToolbarActions({
  table,
  workspaceId,
  folderId,
  setRowAction,
}: TriggersTableToolbarActionsProps) {
  const t = useTranslations()
  const router = useRouter()
  const [openChangeFolder, setOpenChangeFolder] = useState(false)

  const selectedRows = table.getFilteredSelectedRowModel().rows

  return (
    <div className="flex items-center gap-2">
      {selectedRows.length > 0 ? (
        <>
          <DeleteTriggersDialog
            onOpenChange={() => setRowAction(null)}
            onSuccess={() => {
              table.toggleAllRowsSelected(false)
              router.refresh()
            }}
            triggers={selectedRows.map((row) => row.original)}
            workspaceId={workspaceId}
          />
          <ChangeFolderDialog
            currentFolderId={null}
            folderType="trigger"
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
        </>
      ) : null}

      <CreateTriggerDialog folderId={folderId} workspaceId={workspaceId} />
    </div>
  )
}
