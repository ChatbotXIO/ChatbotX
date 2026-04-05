"use client"

import { folderTypes } from "@chatbotx.io/database/partials"
import type { WebhookModel } from "@chatbotx.io/database/types"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
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
  workspaceId: string
  folderId: string | null
}

export function WebhooksTable({
  promises,
  workspaceId,
  folderId,
}: WebhooksTableProps) {
  const t = useTranslations()
  const router = useRouter()

  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<WebhookModel> | null>(null)

  const columns = useMemo(
    () => getColumns({ workspaceId, setRowAction, t }),
    [workspaceId, t],
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
            folderId={folderId}
            setRowAction={setRowAction}
            table={table}
            workspaceId={workspaceId}
          />
        </DataTableToolbar>
      </DataTable>

      <RenameWebhookDialog
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "rename"}
        webhook={rowAction?.row.original || null}
      />

      <DeleteWebhooksDialog
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => router.refresh()}
        open={rowAction?.variant === "delete"}
        showWebhook={false}
        webhooks={rowAction?.row.original ? [rowAction?.row.original] : []}
        workspaceId={workspaceId}
      />

      <ChangeFolderDialog
        currentFolderId={rowAction?.row.original?.folderId || null}
        folderType={folderTypes.enum.webhook}
        modelIds={rowAction?.row.original ? [rowAction?.row.original.id] : []}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "move"}
        workspaceId={workspaceId}
      />
    </>
  )
}
