"use client"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import type {
  DataTableFilterField,
  DataTableRowAction,
} from "@/components/data-table/types"
import { useDataTable } from "@/hooks/use-data-table"
import type { AutomatedResponse } from "@ahachat.ai/database"
import type { Row } from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import React from "react"
import { toast } from "sonner"
import { removeAutomatedResponseAction } from "./actions/remove-automated-response-action"
import { getColumns } from "./automated-responses-table-columns"
import type { getAutomatedResponses } from "./queries"

interface AutomatedResponseTableProps {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof getAutomatedResponses>>]>
}

export function AutomatedResponsesTable({
  chatbotId,
  promises,
}: AutomatedResponseTableProps) {
  const router = useRouter()
  const [{ data, pageCount }] = React.use(promises)
  const [, setRowAction] =
    React.useState<DataTableRowAction<AutomatedResponse> | null>(null)

  const onDeleteRow = async (row: Row<AutomatedResponse>) => {
    try {
      await removeAutomatedResponseAction(row.id)
      toast.success("Automated Response deleted successfully")
      router.refresh()
    } catch (error) {
      if ((error as Partial<{ serverError: string }>).serverError) {
        toast.error((error as Partial<{ serverError: string }>).serverError)
      }
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const columns = React.useMemo(
    () => getColumns(chatbotId, onDeleteRow),
    [setRowAction],
  )

  const filterFields: DataTableFilterField<
    AutomatedResponse & { keyword?: string }
  >[] = [
    {
      id: "keyword",
      label: "Search",
      placeholder: "Enter keyword...",
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
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table} filterFields={filterFields} />
      </DataTable>
    </>
  )
}
