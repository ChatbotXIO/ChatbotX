"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import { useTranslations } from "next-intl"
import React, { useMemo, useState } from "react"
import { DeleteSpreadsheetsDialog } from "./delete-spreadsheet-dialog"
import { UpdateSpreadsheetDialog } from "./edit-spreadsheet-dialog"
import type { listSpreadsheets } from "./queries/list-spreadsheet.queries"
import type { SpreadsheetResource } from "./schema/resource"
import { getSpreadsheetColumns } from "./spreadsheets-table-columns"

type SpreadsheetsTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listSpreadsheets>>]>
  workspaceId: string
}

export function SpreadsheetsTable({
  promises,
  workspaceId,
}: SpreadsheetsTableProps) {
  const t = useTranslations()
  const [{ data, pageCount }] = React.use(promises)
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<SpreadsheetResource> | null>(null)

  const columns = useMemo(() => getSpreadsheetColumns({ t, setRowAction }), [t])

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
      <DataTable table={table} />

      <DeleteSpreadsheetsDialog
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        open={rowAction?.variant === "delete"}
        showTrigger={false}
        spreadsheets={rowAction?.row.original ? [rowAction?.row.original] : []}
        workspaceId={workspaceId}
      />

      <UpdateSpreadsheetDialog
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "update"}
        spreadsheet={rowAction?.row.original || null}
      />
    </>
  )
}
