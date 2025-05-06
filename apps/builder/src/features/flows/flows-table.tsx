"use client"

import type { getCurrentFolder } from "@/features/folders/queries"
import { useDataTable } from "@/hooks/use-data-table"
import React, { useMemo, useState } from "react"
import { DeleteFlowsDialog } from "./delete-flow-dialog"
import { getFlowColumns } from "./flows-table-columns"
import { FlowsTableToolbarActions } from "./flows-table-toolbar-actions"
import type { getFlows } from "./queries"
import { RenameFlowDialog } from "./rename-flow-dialog"
import { DataTable } from "@/components/data-table"
import { DataTableToolbar } from "@/components/data-table-toolbar"
import type { DataTableRowAction } from "@/types/data-table"
import type { FlowResource } from "./schemas/get-flows-schema"

interface FlowsTableProps {
  promises: Promise<
    [
      Awaited<ReturnType<typeof getCurrentFolder>>,
      Awaited<ReturnType<typeof getFlows>>,
    ]
  >
  chatbotId: string
}

export function FlowsTable({ promises, chatbotId }: FlowsTableProps) {
  const [_, { data, pageCount }] = React.use(promises)
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<FlowResource> | null>(null)

  const columns = useMemo(() => getFlowColumns({ setRowAction }), [])

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
          <FlowsTableToolbarActions
            table={table}
            chatbotId={chatbotId}
            setRowAction={setRowAction}
          />
        </DataTableToolbar>
      </DataTable>

      <DeleteFlowsDialog
        open={rowAction?.variant === "delete"}
        onOpenChange={() => setRowAction(null)}
        chatbotId={chatbotId}
        flows={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
      />

      <RenameFlowDialog
        open={rowAction?.variant === "rename"}
        onOpenChange={() => setRowAction(null)}
        flow={rowAction?.row.original || null}
      />
    </>
  )
}
