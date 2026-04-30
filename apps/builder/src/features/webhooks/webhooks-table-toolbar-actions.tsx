"use client"

import type { WebhookModel } from "@chatbotx.io/database/types"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { Table } from "@tanstack/react-table"
import { FolderUpIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { type Dispatch, type SetStateAction, useState } from "react"
import { ChangeFolderDialog } from "../folders/change-folder"
import { CreateWebhookDialog } from "./create-webhook-dialog"
import { DeleteWebhooksDialog } from "./delete-webhooks-dialog"

type WebhooksTableToolbarActionsProps = {
  table: Table<WebhookModel>
  workspaceId: string
  folderId: string | null
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<WebhookModel> | null>
  >
}

export function WebhooksTableToolbarActions({
  table,
  workspaceId,
  folderId,
  setRowAction,
}: WebhooksTableToolbarActionsProps) {
  const t = useTranslations()
  const router = useRouter()
  const [openChangeFolder, setOpenChangeFolder] = useState(false)

  const selectedRows = table.getFilteredSelectedRowModel().rows

  return (
    <div className="flex items-center gap-2">
      {selectedRows.length > 0 ? (
        <>
          <DeleteWebhooksDialog
            onOpenChange={() => setRowAction(null)}
            onSuccess={() => {
              table.toggleAllRowsSelected(false)
              router.refresh()
            }}
            webhooks={selectedRows.map((row) => row.original)}
            workspaceId={workspaceId}
          />
          <ChangeFolderDialog
            currentFolderId={null}
            folderType="webhook"
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

      <CreateWebhookDialog folderId={folderId} workspaceId={workspaceId} />
    </div>
  )
}
