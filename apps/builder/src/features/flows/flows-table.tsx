"use client"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import type { DataTableFilterField } from "@/components/data-table/types"
import type { getCurrentFolder } from "@/features/folders/queries"
import { useDataTable } from "@/hooks/use-data-table"
import type { Flow } from "@ahachat.ai/database/browser"
import React, { useMemo, useState } from "react"
import { DeleteFlowsDialog } from "./delete-flow-dialog"
import { type DataTableRowAction, getFlowColumns } from "./flows-table-columns"
import { FlowsTableToolbarActions } from "./flows-table-toolbar-actions"
import type { getFlows } from "./queries"
import { RenameFlowDialog } from "./rename-flow-dialog"

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
  const [rowAction, setRowAction] = useState<DataTableRowAction<Flow> | null>(
    null,
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const columns = useMemo(
    () => getFlowColumns({ setRowAction }),
    [setRowAction],
  )

  const filterFields: DataTableFilterField<Flow & { title?: string }>[] = [
    {
      id: "title",
      label: "Search",
      placeholder: "Enter flows.name...",
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
        <DataTableToolbar table={table} filterFields={filterFields}>
          <FlowsTableToolbarActions
            table={table}
            chatbotId={chatbotId}
            setRowAction={setRowAction}
          />
        </DataTableToolbar>
      </DataTable>

      <DeleteFlowsDialog
        open={rowAction?.type === "delete"}
        onOpenChange={() => setRowAction(null)}
        chatbotId={chatbotId}
        flows={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
      />

      <RenameFlowDialog
        open={rowAction?.type === "rename"}
        onOpenChange={() => setRowAction(null)}
        chatbotId={chatbotId}
        flow={rowAction?.row.original || null}
      />
    </>
  )
}
