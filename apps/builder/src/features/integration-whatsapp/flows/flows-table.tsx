"use client"

import type { WhatsappFlowModel } from "@aha.chat/database/types"
import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import React, { useMemo, useState } from "react"
import type { getWhatsappFlows } from "@/features/integration-whatsapp/flows/queries"
import { getColumns } from "./flows-table-columns"
import { WhatsappFlowsTableToolbarActions } from "./flows-table-toolbar-actions"

type WhatsappFlowsTableProps = {
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
    <DataTable table={table}>
      <DataTableToolbar table={table}>
        <WhatsappFlowsTableToolbarActions chatbotId={chatbotId} />
      </DataTableToolbar>
    </DataTable>
  )
}
