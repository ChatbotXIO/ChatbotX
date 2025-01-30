"use client"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import type {
  DataTableFilterField,
  DataTableRowAction,
} from "@/components/data-table/types"
import type { getAgents } from "@/features/integrations/open-ai/queries"
import { useDataTable } from "@/hooks/use-data-table"
import { use, useMemo, useState } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { getAgentsColumns } from "./table-columns"

interface AgentsTableProps {
  promises: Promise<[Awaited<ReturnType<typeof getAgents>>]>
  chatbotId: string
}

export function AgentsTable({ promises, chatbotId }: AgentsTableProps) {
  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] = useState<DataTableRowAction<
    Record<string, string>
  > | null>(null)
  const [_, copy] = useCopyToClipboard()

  const duplicateAgent = (id: string) => {
    copy(id)
      .then(() => {
        toast.success("Duplicate successfully!")
      })
      .catch(() => {
        toast.error("Failed to copy!")
      })
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const columns = useMemo(
    () => getAgentsColumns({ setRowAction, duplicateAgent }),
    [setRowAction],
  )

  const filterFields: DataTableFilterField<
    Record<string, string> & { name?: string }
  >[] = [
    {
      id: "name",
      label: "Search",
      placeholder: "Enter agent name...",
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
          {/*<TagsTableToolbarActions table={table} chatbotId={chatbotId} />*/}
        </DataTableToolbar>
      </DataTable>

      {/*<DeleteTagsDialog*/}
      {/*  open={rowAction?.type === "delete"}*/}
      {/*  onOpenChange={() => setRowAction(null)}*/}
      {/*  tags={rowAction?.row.original ? [rowAction?.row.original] : []}*/}
      {/*  showTrigger={false}*/}
      {/*  onSuccess={() => rowAction?.row.toggleSelected(false)}*/}
      {/*  chatbotId={chatbotId}*/}
      {/*/>*/}

      {/*<UpdateTagDialog*/}
      {/*  open={rowAction?.type === "update"}*/}
      {/*  onOpenChange={() => setRowAction(null)}*/}
      {/*  chatbotId={chatbotId}*/}
      {/*  tag={rowAction?.row.original || null}*/}
      {/*/>*/}
    </>
  )
}
