"use client"

import { DataTable } from "@/components/data-table"
import { DataTableToolbar } from "@/components/data-table-toolbar"
import type { getFlows } from "@/features/integration-whatsapp/flows/queries"
import { useDataTable } from "@/hooks/use-data-table"
import type { DataTableRowAction } from "@/types/data-table"
import type { WhatsappFlow } from "@ahachat.ai/database"
import type { ColumnDef } from "@tanstack/react-table"
import React, { useMemo, useState } from "react"
import { getColumns } from "./flows-table-columns"
import { FlowsTableToolbarActions } from "./flows-table-toolbar-actions"

interface FlowsTableProps {
  promises: Promise<[Awaited<ReturnType<typeof getFlows>>]>
  chatbotId: string
}

export function FlowsTable({ promises, chatbotId }: FlowsTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const [_rowAction, setRowAction] =
    useState<DataTableRowAction<WhatsappFlow> | null>(null)

  const columns = useMemo<ColumnDef<WhatsappFlow>[]>(
    () => getColumns({ setRowAction }),
    [],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
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
        <DataTableToolbar table={table}>
          <FlowsTableToolbarActions chatbotId={chatbotId} />
        </DataTableToolbar>
      </DataTable>
    </>
  )
}
