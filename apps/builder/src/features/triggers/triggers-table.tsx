"use client"

import { folderTypes } from "@chatbotx.io/database/partials"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import { ChangeFolderDialog } from "../folders/change-folder"
import { RenameTriggerDialog } from "./components/rename-trigger-dialog"
import { DeleteTriggersDialog } from "./delete-triggers-dialog"
import type { getTriggers } from "./queries"
import type { TriggerResource } from "./schema/resource"
import { getColumns } from "./triggers-table-columns"
import { TriggersTableToolbarActions } from "./triggers-table-toolbar-actions"

type TriggersTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof getTriggers>>]>
  workspaceId: string
  folderId: string | null
}

export function TriggersTable({
  promises,
  workspaceId,
  folderId,
}: TriggersTableProps) {
  const t = useTranslations()
  const router = useRouter()

  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<TriggerResource> | null>(null)

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
          <TriggersTableToolbarActions
            folderId={folderId}
            setRowAction={setRowAction}
            table={table}
            workspaceId={workspaceId}
          />
        </DataTableToolbar>
      </DataTable>

      <RenameTriggerDialog
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "rename"}
        trigger={rowAction?.row.original || null}
      />

      <DeleteTriggersDialog
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => router.refresh()}
        open={rowAction?.variant === "delete"}
        showTrigger={false}
        triggers={rowAction?.row.original ? [rowAction?.row.original] : []}
        workspaceId={workspaceId}
      />

      <ChangeFolderDialog
        currentFolderId={rowAction?.row.original?.folderId || null}
        folderType={folderTypes.enum.trigger}
        modelIds={rowAction?.row.original ? [rowAction?.row.original.id] : []}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "move"}
        workspaceId={workspaceId}
      />
    </>
  )
}
