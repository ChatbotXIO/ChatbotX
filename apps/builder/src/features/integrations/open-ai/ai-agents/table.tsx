"use client"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import type {
  DataTableFilterField,
  DataTableRowAction,
} from "@/components/data-table/types"
import { DeleteAiAgentsDialog } from "@/features/integrations/open-ai/ai-agents/delete"
import { AiAgentsTableToolbarActions } from "@/features/integrations/open-ai/ai-agents/table-toolbar-actions"
import { UpdateAiAgentDialog } from "@/features/integrations/open-ai/ai-agents/update"
import type { getAiAgents } from "@/features/integrations/open-ai/queries/ai-agents.query"
import { useDataTable } from "@/hooks/use-data-table"
import type { AiAgent } from "@ahachat.ai/database"
import { use, useMemo, useState } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { GetAiAgentsColumns } from "./table-columns"

interface AiAgentsTableProps {
  promises: Promise<[Awaited<ReturnType<typeof getAiAgents>>]>
  chatbotId: string
}

export function AiAgentsTable({ promises, chatbotId }: AiAgentsTableProps) {
  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<AiAgent> | null>(null)
  const [_, copy] = useCopyToClipboard()

  const duplicateAiAgent = (id: string) => {
    copy(id)
      .then(() => {
        toast.success("Duplicate successfully!")
      })
      .catch(() => {
        toast.error("Failed to copy!")
      })
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const columns = useMemo(
    () => GetAiAgentsColumns({ setRowAction, duplicateAiAgent }),
    [setRowAction],
  )

  const filterFields: DataTableFilterField<AiAgent & { name?: string }>[] = [
    {
      id: "name",
      label: "Search",
      placeholder: "Enter ai-agent name...",
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
    getRowId: (originalRow: AiAgent) => originalRow.id as string,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table} filterFields={filterFields}>
          <AiAgentsTableToolbarActions
            table={table}
            chatbotId={chatbotId}
            onOpenChange={() => setRowAction(null)}
          />
        </DataTableToolbar>
      </DataTable>

      <DeleteAiAgentsDialog
        open={rowAction?.type === "delete"}
        onOpenChange={() => setRowAction(null)}
        agents={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        chatbotId={chatbotId}
      />

      <UpdateAiAgentDialog
        open={rowAction?.type === "update"}
        onOpenChange={() => setRowAction(null)}
        chatbotId={chatbotId}
        agent={rowAction?.row.original || null}
      />
    </>
  )
}
