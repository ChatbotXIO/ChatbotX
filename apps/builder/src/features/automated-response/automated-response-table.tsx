"use client"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import type { DataTableFilterField } from "@/components/data-table/types"
import { useDataTable } from "@/hooks/use-data-table"
import type { AutomatedResponse } from "@ahachat.ai/database"
import React from "react"
import {
  type DataTableRowAction,
  getColumns,
} from "./automated-responses-table-columns"
import type { getAutomatedResponses } from "./queries"
import type { AutomatedResponseResource } from "./schemas/get-automated-responses-schema"

interface AutomatedResponseTableProps {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof getAutomatedResponses>>]>
}

export function AutomatedResponsesTable({
  promises,
}: AutomatedResponseTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const [, setRowAction] =
    React.useState<DataTableRowAction<AutomatedResponseResource> | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const columns = React.useMemo(
    () => getColumns({ setRowAction }),
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
