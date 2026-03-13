"use client"

import { FolderType } from "@aha.chat/database/enums"
import type { TriggerModel } from "@aha.chat/database/types"
import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import { ChangeFolderDialog } from "../folders/change-folder"
import { RenameTriggerDialog } from "./components/rename-trigger-dialog"
import { DeleteTriggersDialog } from "./delete-triggers-dialog"
import type { getTriggers } from "./queries"
import { getColumns } from "./triggers-table-columns"
import { TriggersTableToolbarActions } from "./triggers-table-toolbar-actions"

type TriggersTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof getTriggers>>]>
  chatbotId: string
}

export function TriggersTable({ promises, chatbotId }: TriggersTableProps) {
  const t = useTranslations()
  const router = useRouter()

  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<TriggerModel> | null>(null)

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
          <TriggersTableToolbarActions
            chatbotId={chatbotId}
            setRowAction={setRowAction}
            table={table}
          />
        </DataTableToolbar>
      </DataTable>

      <RenameTriggerDialog
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "rename"}
        trigger={rowAction?.row.original || null}
      />

      <DeleteTriggersDialog
        chatbotId={chatbotId}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => router.refresh()}
        open={rowAction?.variant === "delete"}
        showTrigger={false}
        triggers={rowAction?.row.original ? [rowAction?.row.original] : []}
      />

      <ChangeFolderDialog
        chatbotId={chatbotId}
        currentFolderId={rowAction?.row.original?.folderId || null}
        folderType={FolderType.trigger}
        modelIds={rowAction?.row.original ? [rowAction?.row.original.id] : []}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "move"}
      />
    </>
  )
}
