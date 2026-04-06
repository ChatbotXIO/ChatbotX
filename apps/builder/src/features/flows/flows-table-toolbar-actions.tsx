"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { Table } from "@tanstack/react-table"
import { FolderUpIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { type Dispatch, type SetStateAction, useState } from "react"
import { ChangeFolderDialog } from "../folders/change-folder"
import { DeleteFlowsDialog } from "./delete-flow-dialog"
import type { FlowResource } from "./schemas/resource"

type FlowsTableToolbarActionsProps = {
  table: Table<FlowResource>
  workspaceId: string
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<FlowResource> | null>
  >
}

export function FlowsTableToolbarActions({
  table,
  workspaceId,
  setRowAction,
}: FlowsTableToolbarActionsProps) {
  const t = useTranslations()
  const router = useRouter()
  const [openChangeFolder, setOpenChangeFolder] = useState(false)

  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <>
          <DeleteFlowsDialog
            flows={table
              .getFilteredSelectedRowModel()
              .rows.map((row) => row.original)}
            onOpenChange={() => setRowAction(null)}
            onSuccess={() => {
              table.toggleAllRowsSelected(false)
              router.refresh()
            }}
            workspaceId={workspaceId}
          />
          <ChangeFolderDialog
            currentFolderId={null}
            folderType="flow"
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
