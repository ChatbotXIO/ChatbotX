"use client"

import { duplicateAITriggerAction } from "@/features/integrations/ai-triggers/actions/duplicate.action"
import { DeleteAITriggerDialog } from "@/features/integrations/ai-triggers/delete"
import type { listAITriggers } from "@/features/integrations/ai-triggers/actions/list.action"
import { AITriggersTableToolbarActions } from "@/features/integrations/ai-triggers/table-toolbar-actions"
import { UpdateAITriggerDialog } from "@/features/integrations/ai-triggers/update"
import { useDataTable } from "@/hooks/use-data-table"
import type { AITrigger } from "@ahachat.ai/database/types"
import { useAction } from "next-safe-action/hooks"
import { useRouter } from "next/navigation"
import { use, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { getAITriggersColumns } from "./table-columns"
import type { DataTableRowAction } from "@/types/data-table"
import { DataTable } from "@/components/data-table"
import { DataTableToolbar } from "@/components/data-table-toolbar"

interface AITriggersTableProps {
  promises: Promise<[Awaited<ReturnType<typeof listAITriggers>>]>
  chatbotId: string
}

export function AITriggersTable({ promises, chatbotId }: AITriggersTableProps) {
  const [{ data, pageCount }] = use(promises)
  const router = useRouter()
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<AITrigger> | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const columns = useMemo(
    () => getAITriggersColumns({ setRowAction }),
    [setRowAction],
  )

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
    getRowId: (originalRow: AITrigger) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <AITriggersTableToolbarActions
            table={table}
            chatbotId={chatbotId}
            onOpenChange={() => setRowAction(null)}
          />
        </DataTableToolbar>
      </DataTable>

      <DeleteAITriggerDialog
        open={rowAction?.variant === "delete"}
        onOpenChange={() => setRowAction(null)}
        trigger={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        chatbotId={chatbotId}
      />

      <UpdateAITriggerDialog
        open={rowAction?.variant === "update"}
        onOpenChange={() => setRowAction(null)}
        chatbotId={chatbotId}
        trigger={rowAction?.row.original || null}
      />
    </>
  )
}
