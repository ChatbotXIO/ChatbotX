"use client"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import type {
  DataTableFilterField,
  DataTableRowAction,
} from "@/components/data-table/types"
import { duplicateAIAgentAction } from "@/features/integrations/ai-agents/actions/duplicate.action"
import { DeleteAIAgentsDialog } from "@/features/integrations/ai-agents/delete"
import type { getAIAgents } from "@/features/integrations/ai-agents/actions/list.action"
import { AIAgentsTableToolbarActions } from "@/features/integrations/ai-agents/table-toolbar-actions"
import { UpdateAIAgentDialog } from "@/features/integrations/ai-agents/update"
import { useDataTable } from "@/hooks/use-data-table"
import type { AIAgent } from "@ahachat.ai/database/browser"
import { useAction } from "next-safe-action/hooks"
import { useRouter } from "next/navigation"
import { use, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { GetAIAgentsColumns } from "./table-columns"

interface AIAgentsTableProps {
  promises: Promise<[Awaited<ReturnType<typeof getAIAgents>>]>
  chatbotId: string
}

export function AIAgentsTable({ promises, chatbotId }: AIAgentsTableProps) {
  const [{ data, pageCount }] = use(promises)
  const router = useRouter()
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<AIAgent> | null>(null)

  const { execute } = useAction(
    duplicateAIAgentAction.bind(
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const columns = useMemo(
    () => GetAIAgentsColumns({ setRowAction }),
    [setRowAction],
  )

  const filterFields: DataTableFilterField<AIAgent & { name?: string }>[] = [
    {
      id: "name",
      label: "Search",
      placeholder: "Enter name",
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
    getRowId: (originalRow: AIAgent) => originalRow.id as string,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table} filterFields={filterFields}>
          <AIAgentsTableToolbarActions
            table={table}
            chatbotId={chatbotId}
            onOpenChange={() => setRowAction(null)}
          />
        </DataTableToolbar>
      </DataTable>

      <DeleteAIAgentsDialog
        open={rowAction?.type === "delete"}
        onOpenChange={() => setRowAction(null)}
        agents={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        chatbotId={chatbotId}
      />

      <UpdateAIAgentDialog
        open={rowAction?.type === "update"}
        onOpenChange={() => setRowAction(null)}
        chatbotId={chatbotId}
        agent={rowAction?.row.original || null}
      />
    </>
  )
}
