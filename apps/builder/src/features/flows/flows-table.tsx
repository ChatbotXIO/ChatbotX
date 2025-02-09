"use client"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import type {
  DataTableFilterField,
  DataTableRowAction,
} from "@/components/data-table/types"
import { updateFlowAction } from "@/features/flows/actions/update-flow-action"
import type { UpdateFlowSchema } from "@/features/flows/schemas/update-flow-schema"
import type { getCurrentFolder } from "@/features/folders/queries"
import { useDataTable } from "@/hooks/use-data-table"
import type { Flow } from "@ahachat.ai/database"
import React, { useMemo } from "react"
import { toast } from "sonner"
import { DeleteFlowsDialog } from "./delete-flow-dialog"
import { getFlowColumns } from "./flows-table-columns"
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
  const [{ folder }, { data, pageCount }] = React.use(promises)
  const [rowAction, setRowAction] =
    React.useState<DataTableRowAction<Flow> | null>(null)

  const update = async (id: string, payload: UpdateFlowSchema) => {
    try {
      await updateFlowAction.bind(null, chatbotId, id)(payload)
      toast.success("Update flow successfully")
    } catch (error) {
      if (error?.serverError) {
        toast.error(error?.serverError.message ?? error.serverError)
      }
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const columns = useMemo(
    () => getFlowColumns({ setRowAction, update }),
    [setRowAction],
  )

  const filterFields: DataTableFilterField<Flow & { title?: string }>[] = [
    {
      id: "title",
      label: "Search",
      placeholder: "Enter flows title...",
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
          <FlowsTableToolbarActions table={table} chatbotId={chatbotId} />
        </DataTableToolbar>
      </DataTable>

      <DeleteFlowsDialog
        open={rowAction?.type === "delete"}
        onOpenChange={() => setRowAction(null)}
        permanent={!!folder?.isTrash}
        flows={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        chatbotId={chatbotId}
      />

      <RenameFlowDialog
        open={rowAction?.type === "update"}
        onOpenChange={() => setRowAction(null)}
        chatbotId={chatbotId}
        flow={rowAction?.row.original || null}
      />
    </>
  )
}
