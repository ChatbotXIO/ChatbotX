"use client"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import type {
  DataTableFilterField,
  DataTableRowAction,
} from "@/components/data-table/types"
import { duplicateAITriggerAction } from "@/features/integrations/ai-triggers/actions/duplicate.action"
import { DeleteAITriggerDialog } from "@/features/integrations/ai-triggers/delete"
import type { getAITriggers } from "@/features/integrations/ai-triggers/queries"
import { AITriggersTableToolbarActions } from "@/features/integrations/ai-triggers/table-toolbar-actions"
import { UpdateAITriggerDialog } from "@/features/integrations/ai-triggers/update"
import { useDataTable } from "@/hooks/use-data-table"
import type { AITrigger } from "@ahachat.ai/database/browser"
import { useAction } from "next-safe-action/hooks"
import { useRouter } from "next/navigation"
import { use, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { getAITriggersColumns } from "./table-columns"

interface AITriggersTableProps {
  promises: Promise<[Awaited<ReturnType<typeof getAITriggers>>]>
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
    if (rowAction && rowAction.type === "duplicate") {
      execute()
      setRowAction(null)
      toast.success("Duplicate successfully!")
      router.refresh()
    }
  }, [rowAction, execute, router])

  const filterFields: DataTableFilterField<AITrigger & { name?: string }>[] = [
    {
      id: "name",
      label: "Search",
      placeholder: "Enter trigger name...",
    },
  ]

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    filterFields,
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
        <DataTableToolbar table={table} filterFields={filterFields}>
          <AITriggersTableToolbarActions
            table={table}
            chatbotId={chatbotId}
            onOpenChange={() => setRowAction(null)}
          />
        </DataTableToolbar>
      </DataTable>

      <DeleteAITriggerDialog
        open={rowAction?.type === "delete"}
        onOpenChange={() => setRowAction(null)}
        trigger={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        chatbotId={chatbotId}
      />

      <UpdateAITriggerDialog
        open={rowAction?.type === "update"}
        onOpenChange={() => setRowAction(null)}
        chatbotId={chatbotId}
        trigger={rowAction?.row.original || null}
      />
    </>
  )
}
