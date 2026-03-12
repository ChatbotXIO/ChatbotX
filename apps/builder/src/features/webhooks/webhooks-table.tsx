"use client"

import { FolderType } from "@aha.chat/database/enums"
import type { WebhookModel } from "@aha.chat/database/types"
import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import { ChangeFolderDialog } from "../folders/change-folder"
import { RenameWebhookDialog } from "./components/rename-webhook-dialog"
import { DeleteWebhooksDialog } from "./delete-webhooks-dialog"
import type { getWebhooks } from "./queries"
import { getColumns } from "./webhooks-table-columns"
import { WebhooksTableToolbarActions } from "./webhooks-table-toolbar-actions"

type WebhooksTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof getWebhooks>>]>
  chatbotId: string
}

export function WebhooksTable({ promises, chatbotId }: WebhooksTableProps) {
  const t = useTranslations()
  const router = useRouter()

  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<WebhookModel> | null>(null)

  const columns = useMemo(
    () => getColumns({ chatbotId, setRowAction, t }),
    [chatbotId, t],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["action"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <WebhooksTableToolbarActions
            chatbotId={chatbotId}
            setRowAction={setRowAction}
            table={table}
          />
        </DataTableToolbar>
      </DataTable>

      <RenameWebhookDialog
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "rename"}
        webhook={rowAction?.row.original || null}
      />

      <DeleteWebhooksDialog
        chatbotId={chatbotId}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => router.refresh()}
        open={rowAction?.variant === "delete"}
        showWebhook={false}
        webhooks={rowAction?.row.original ? [rowAction?.row.original] : []}
      />

      <ChangeFolderDialog
        chatbotId={chatbotId}
        currentFolderId={rowAction?.row.original?.folderId || null}
        folderType={FolderType.webhook}
        modelId={rowAction?.row.original?.id || null}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "move"}
      />
    </>
  )
}
