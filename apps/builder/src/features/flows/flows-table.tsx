"use client"

import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import { ChangeFolderDialog } from "../folders/change-folder"
import { DeleteFlowsDialog } from "./delete-flow-dialog"
import { getFlowColumns } from "./flows-table-columns"
import { FlowsTableToolbarActions } from "./flows-table-toolbar-actions"
import type { getFlows } from "./queries"
import { RenameFlowDialog } from "./react-flow/components/rename-flow"
import type { FlowResource } from "./schemas/resource"

type FlowsTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof getFlows>>]>
  chatbotId: string
}

export function FlowsTable({ promises, chatbotId }: FlowsTableProps) {
  const t = useTranslations()
  const router = useRouter()

  const [{ data, pageCount }] = use(promises)

  const [rowAction, setRowAction] =
    useState<DataTableRowAction<FlowResource> | null>(null)
  const columns = useMemo(() => getFlowColumns({ t, setRowAction }), [t])

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <FlowsTableToolbarActions
            chatbotId={chatbotId}
            setRowAction={setRowAction}
            table={table}
          />
        </DataTableToolbar>
      </DataTable>

      <DeleteFlowsDialog
        chatbotId={chatbotId}
        flows={rowAction?.row.original ? [rowAction?.row.original] : []}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          rowAction?.row.toggleSelected(false)
          router.refresh()
        }}
        open={rowAction?.variant === "delete"}
        showTrigger={false}
      />

      <RenameFlowDialog
        flow={rowAction?.row.original || null}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "rename"}
      />

      <ChangeFolderDialog
        chatbotId={chatbotId}
        currentFolderId={rowAction?.row.original?.folderId || null}
        folderType="flow"
        modelIds={rowAction?.row.original ? [rowAction?.row.original.id] : null}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "move"}
      />
    </>
  )
}
