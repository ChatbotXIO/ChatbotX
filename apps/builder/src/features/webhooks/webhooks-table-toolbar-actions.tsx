"use client"

import type { WebhookModel } from "@chatbotx.io/database/types"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { Table } from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import type { Dispatch, SetStateAction } from "react"
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
  const router = useRouter()

  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteWebhooksDialog
          onOpenChange={() => setRowAction(null)}
          onSuccess={() => {
            table.toggleAllRowsSelected(false)
            router.refresh()
          }}
          webhooks={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
          workspaceId={workspaceId}
        />
      ) : null}

      <CreateWebhookDialog folderId={folderId} workspaceId={workspaceId} />
    </div>
  )
}
