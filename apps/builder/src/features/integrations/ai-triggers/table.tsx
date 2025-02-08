"use client"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import type {
  DataTableFilterField,
  DataTableRowAction,
} from "@/components/data-table/types"
import type { getAiTriggers } from "@/features/integrations/ai-triggers/queries/get.query"
import { AiTriggersTableToolbarActions } from "@/features/integrations/ai-triggers/table-toolbar-actions"
import { useDataTable } from "@/hooks/use-data-table"
import type { AiTrigger } from "@ahachat.ai/database"
import { use, useMemo, useState } from "react"
import { getAiTriggersColumns } from "./table-columns"

interface AiTriggersTableProps {
  promises: Promise<[Awaited<ReturnType<typeof getAiTriggers>>]>
  chatbotId: string
}

export function AiTriggersTable({ promises, chatbotId }: AiTriggersTableProps) {
  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<AiTrigger> | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const columns = useMemo(
    () => getAiTriggersColumns({ setRowAction }),
    [setRowAction],
  )

  const filterFields: DataTableFilterField<AiTrigger & { name?: string }>[] = [
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
    getRowId: (originalRow: AiTrigger) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table} filterFields={filterFields}>
          <AiTriggersTableToolbarActions
            table={table}
            chatbotId={chatbotId}
            onOpenChange={() => setRowAction(null)}
          />
        </DataTableToolbar>
      </DataTable>
    </>
  )
}
