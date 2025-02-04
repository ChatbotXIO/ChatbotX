"use client"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import type {
  DataTableFilterField,
  DataTableRowAction,
} from "@/components/data-table/types"
import { DeleteAssistantDialog } from "@/features/integrations/ai-assistants/delete"
import { AiAssistantTableToolbarActions } from "@/features/integrations/ai-assistants/table-toolbar-actions"
import { UpdateAiAssistantDialog } from "@/features/integrations/ai-assistants/update"
import type { getAiAssistants } from "@/features/integrations/ai-assistants/queries/get.query"
import { useDataTable } from "@/hooks/use-data-table"
import type { AiAssistant } from "@ahachat.ai/database"
import { use, useMemo, useState } from "react"
import { getAssistantColumns } from "./table-columns"

interface AiAssistantsTableProps {
  promises: Promise<[Awaited<ReturnType<typeof getAiAssistants>>]>
  chatbotId: string
}

export function AiAssistantsTable({
  promises,
  chatbotId,
}: AiAssistantsTableProps) {
  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<AiAssistant> | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const columns = useMemo(
    () => getAssistantColumns({ setRowAction }),
    [setRowAction],
  )

  const filterFields: DataTableFilterField<AiAssistant & { name?: string }>[] =
    [
      {
        id: "name",
        label: "Search",
        placeholder: "Enter assistant name...",
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
    getRowId: (originalRow: AiAssistant) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table} filterFields={filterFields}>
          <AiAssistantTableToolbarActions
            table={table}
            chatbotId={chatbotId}
            onOpenChange={() => setRowAction(null)}
          />
        </DataTableToolbar>
      </DataTable>

      <DeleteAssistantDialog
        open={rowAction?.type === "delete"}
        onOpenChange={() => setRowAction(null)}
        assistant={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        chatbotId={chatbotId}
      />

      <UpdateAiAssistantDialog
        open={rowAction?.type === "update"}
        onOpenChange={() => setRowAction(null)}
        chatbotId={chatbotId}
        assistant={rowAction?.row.original || null}
      />
    </>
  )
}
