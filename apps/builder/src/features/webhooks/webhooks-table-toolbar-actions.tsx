"use client"

import type { WebhookModel } from "@aha.chat/database/types"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { Table } from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import type { Dispatch, SetStateAction } from "react"

import { DeleteWebhooksDialog } from "./delete-webhooks-dialog"

type WebhooksTableToolbarActionsProps = {
  table: Table<WebhookModel>
  chatbotId: string
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<WebhookModel> | null>
  >
}

export function WebhooksTableToolbarActions({
  table,
  chatbotId,
  setRowAction,
}: WebhooksTableToolbarActionsProps) {
  const router = useRouter()

  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteWebhooksDialog
          chatbotId={chatbotId}
          onOpenChange={() => setRowAction(null)}
          onSuccess={() => {
            table.toggleAllRowsSelected(false)
            router.refresh()
          }}
          webhooks={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
        />
      ) : null}
    </div>
  )
}
