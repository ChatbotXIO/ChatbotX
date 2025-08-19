"use client"

import type { AIAgentModel } from "@aha.chat/database/types"
import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import { useRouter } from "next/navigation"
import { useAction } from "next-safe-action/hooks"
import { use, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { duplicateAIAgentAction } from "@/features/integrations/ai-agents/actions/duplicate.action"
import type { getAIAgents } from "@/features/integrations/ai-agents/actions/list.action"
import { DeleteAIAgentsDialog } from "@/features/integrations/ai-agents/delete"
import { AIAgentsTableToolbarActions } from "@/features/integrations/ai-agents/table-toolbar-actions"
import { UpdateAIAgentDialog } from "@/features/integrations/ai-agents/update"
import { GetAIAgentsColumns } from "./table-columns"

type AIAgentsTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof getAIAgents>>]>
  chatbotId: string
}

export function AIAgentsTable({ promises, chatbotId }: AIAgentsTableProps) {
  const [{ data, pageCount }] = use(promises)
  const router = useRouter()
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<AIAgentModel> | null>(null)

  const { execute } = useAction(
    duplicateAIAgentAction.bind(
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: wip
  const columns = useMemo(
    () => GetAIAgentsColumns({ setRowAction }),
    [setRowAction],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow: AIAgentModel) => originalRow.id as string,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <AIAgentsTableToolbarActions
            chatbotId={chatbotId}
            onOpenChange={() => setRowAction(null)}
            table={table}
          />
        </DataTableToolbar>
      </DataTable>

      <DeleteAIAgentsDialog
        agents={rowAction?.row.original ? [rowAction?.row.original] : []}
        chatbotId={chatbotId}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        open={rowAction?.variant === "delete"}
        showTrigger={false}
      />

      <UpdateAIAgentDialog
        agent={rowAction?.row.original || null}
        chatbotId={chatbotId}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "update"}
      />
    </>
  )
}
