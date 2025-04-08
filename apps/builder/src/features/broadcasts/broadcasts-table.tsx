"use client"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import type { DataTableFilterField } from "@/components/data-table/types"
import type { listBroadcasts } from "@/features/broadcasts/queries"
import { useDataTable } from "@/hooks/use-data-table"
import type { Broadcast } from "@ahachat.ai/database"
import React, { useMemo, useState } from "react"
import { type DataTableRowAction, getColumns } from "./broadcasts-table-columns"
import { RenameBroadcastDialog } from "./rename-broadcast-dialog"

interface BroadcastsTableProps {
  promises: Promise<[Awaited<ReturnType<typeof listBroadcasts>>]>
}

export function BroadcastsTable({ promises }: BroadcastsTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<Broadcast> | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const columns = useMemo(() => getColumns({ setRowAction }), [setRowAction])

  const filterFields: DataTableFilterField<Broadcast>[] = []

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

      <RenameBroadcastDialog
        open={rowAction?.type === "rename"}
        onOpenChange={() => setRowAction(null)}
        broadcast={rowAction?.row.original || null}
      />
    </>
  )
}
