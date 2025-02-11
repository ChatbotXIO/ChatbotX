"use client"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import type {
  DataTableFilterField,
  DataTableRowAction,
} from "@/components/data-table/types"
import type { getFlows } from "@/features/flows/queries/get.query"
import { duplicateAiTriggerAction } from "@/features/integrations/ai-triggers/actions/duplicate.action"
import { DeleteAiTriggerDialog } from "@/features/integrations/ai-triggers/delete"
import type { getAiTriggers } from "@/features/integrations/ai-triggers/queries/get.query"
import { AiTriggersTableToolbarActions } from "@/features/integrations/ai-triggers/table-toolbar-actions"
import { UpdateAiTriggerDialog } from "@/features/integrations/ai-triggers/update"
import { useDataTable } from "@/hooks/use-data-table"
import type { AiTrigger } from "@ahachat.ai/database"
import { useAction } from "next-safe-action/hooks"
import { useRouter } from "next/navigation"
import { use, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { getAiTriggersColumns } from "./table-columns"

interface AiTriggersTableProps {
  promises: Promise<
    [
      Awaited<ReturnType<typeof getAiTriggers>>,
      Awaited<ReturnType<typeof getFlows>>,
    ]
  >
  chatbotId: string
}

export function AiTriggersTable({ promises, chatbotId }: AiTriggersTableProps) {
  const [{ data, pageCount }, flows] = use(promises)
  const router = useRouter()
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<AiTrigger> | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const columns = useMemo(
    () => getAiTriggersColumns({ setRowAction }),
    [setRowAction],
  )

  const { execute, result } = useAction(
    duplicateAiTriggerAction.bind(
      null,
      chatbotId,
      rowAction?.row.original ? rowAction.row.original.id : "",
    ),
  )

  useEffect(() => {
    if (rowAction && rowAction.type === "duplicate") {
      execute()
      setRowAction(null)
      toast.success("Duplicate successfully!")
      router.refresh()
    }
  }, [rowAction, execute, router])

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

      <DeleteAiTriggerDialog
        open={rowAction?.type === "delete"}
        onOpenChange={() => setRowAction(null)}
        trigger={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        chatbotId={chatbotId}
      />

      <UpdateAiTriggerDialog
        open={rowAction?.type === "update"}
        onOpenChange={() => setRowAction(null)}
        chatbotId={chatbotId}
        trigger={rowAction?.row.original || null}
        flows={flows.data}
      />
    </>
  )
}
