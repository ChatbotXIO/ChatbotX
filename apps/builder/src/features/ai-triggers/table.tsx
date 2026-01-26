"use client"

import type { AITriggerModel } from "@aha.chat/database/types"
import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import { useRouter } from "next/navigation"
import { useAction } from "next-safe-action/hooks"
import { use, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { duplicateAITriggerAction } from "@/features/ai-triggers/actions/duplicate.action"
import type { listAITriggers } from "@/features/ai-triggers/actions/list.action"
import { DeleteAITriggerDialog } from "@/features/ai-triggers/delete"
import { AITriggersTableToolbarActions } from "@/features/ai-triggers/table-toolbar-actions"
import { getAITriggersColumns } from "./table-columns"

type AITriggersTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listAITriggers>>]>
  chatbotId: string
}

export function AITriggersTable({ promises, chatbotId }: AITriggersTableProps) {
  const [{ data, pageCount }] = use(promises)
  const router = useRouter()
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<AITriggerModel> | null>(null)

  const columns = useMemo(() => getAITriggersColumns({ setRowAction }), [])

  const { execute } = useAction(
    duplicateAITriggerAction.bind(
      null,
      chatbotId,
      rowAction?.row.original ? rowAction.row.original.id : "",
    ),
  )

  useEffect(() => {
    if (rowAction && rowAction.variant === "duplicate") {
      execute()
      setRowAction(null)
      toast.success("Duplicate successfully!")
      router.refresh()
    }
  }, [rowAction, execute, router])

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow: AITriggerModel) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <AITriggersTableToolbarActions
            chatbotId={chatbotId}
            onOpenChange={() => setRowAction(null)}
            table={table}
          />
        </DataTableToolbar>
      </DataTable>

      <DeleteAITriggerDialog
        chatbotId={chatbotId}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        open={rowAction?.variant === "delete"}
        showTrigger={false}
        trigger={rowAction?.row.original ? [rowAction?.row.original] : []}
      />
    </>
  )
}
