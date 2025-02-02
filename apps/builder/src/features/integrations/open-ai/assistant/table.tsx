"use client"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import type {
  DataTableFilterField,
  DataTableRowAction,
} from "@/components/data-table/types"
import { DeleteAssistantDialog } from "@/features/integrations/open-ai/assistant/delete"
import { AssistantTableToolbarActions } from "@/features/integrations/open-ai/assistant/table-toolbar-actions"
import { UpdateAssistantDialog } from "@/features/integrations/open-ai/assistant/update"
import type { getAssistants } from "@/features/integrations/open-ai/queries/assistant.query"
import { useDataTable } from "@/hooks/use-data-table"
import { use, useMemo, useState } from "react"
import { getAssistantColumns } from "./table-columns"

interface AgentsTableProps {
  promises: Promise<[Awaited<ReturnType<typeof getAssistants>>]>
  chatbotId: string
}

export function AssistantTable({ promises, chatbotId }: AgentsTableProps) {
  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] = useState<DataTableRowAction<
    Record<string, string>
  > | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const columns = useMemo(
    () => getAssistantColumns({ setRowAction }),
    [setRowAction],
  )

  const filterFields: DataTableFilterField<
    Record<string, string> & { name?: string }
  >[] = [
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
    getRowId: (originalRow: Record<string, string>) => originalRow.id as string,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table} filterFields={filterFields}>
          <AssistantTableToolbarActions
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

      <UpdateAssistantDialog
        open={rowAction?.type === "update"}
        onOpenChange={() => setRowAction(null)}
        chatbotId={chatbotId}
        assistant={rowAction?.row.original || null}
      />
    </>
  )
}
