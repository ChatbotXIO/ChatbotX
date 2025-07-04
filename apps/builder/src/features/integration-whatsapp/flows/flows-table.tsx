"use client"

import { DataTable } from "@/components/data-table"
import { DataTableToolbar } from "@/components/data-table-toolbar"
import type { getWhatsappFlows } from "@/features/integration-whatsapp/flows/queries"
import { useDataTable } from "@/hooks/use-data-table"
import type { DataTableRowAction } from "@/types/data-table"
import type { WhatsappFlowModel } from "@ahachat.ai/database/types"
import type { ColumnDef } from "@tanstack/react-table"
import React, { useMemo, useState } from "react"
import { getColumns } from "./flows-table-columns"
import { WhatsappFlowsTableToolbarActions } from "./flows-table-toolbar-actions"

interface WhatsappFlowsTableProps {
  promises: Promise<[Awaited<ReturnType<typeof getWhatsappFlows>>]>
  chatbotId: string
}

export function WhatsappFlowsTable({
  promises,
  chatbotId,
}: WhatsappFlowsTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const [_rowAction, setRowAction] =
    useState<DataTableRowAction<WhatsappFlowModel> | null>(null)

  const columns = useMemo<ColumnDef<WhatsappFlowModel>[]>(
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
          <WhatsappFlowsTableToolbarActions chatbotId={chatbotId} />
        </DataTableToolbar>
      </DataTable>
    </>
  )
}
