"use client"

import type { FlowModel } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { Table } from "@tanstack/react-table"
import { FolderUpIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { type Dispatch, type SetStateAction, useState } from "react"
import { ChangeFolderDialog } from "../folders/change-folder"
import { DeleteFlowsDialog } from "./delete-flow-dialog"

type FlowsTableToolbarActionsProps = {
  table: Table<FlowModel>
  chatbotId: string
  setRowAction: Dispatch<SetStateAction<DataTableRowAction<FlowModel> | null>>
}

export function FlowsTableToolbarActions({
  table,
  chatbotId,
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
            chatbotId={chatbotId}
            flows={table
              .getFilteredSelectedRowModel()
              .rows.map((row) => row.original)}
            onOpenChange={() => setRowAction(null)}
            onSuccess={() => {
              table.toggleAllRowsSelected(false)
              router.refresh()
            }}
          />
          <ChangeFolderDialog
            chatbotId={chatbotId}
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
          />
        </>
      ) : null}
    </div>
  )
}
