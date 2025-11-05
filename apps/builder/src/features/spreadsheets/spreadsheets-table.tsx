"use client"

import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import { useTranslations } from "next-intl"
import React, { useMemo, useState } from "react"
import { DeleteSpreadsheetsDialog } from "./delete-spreadsheet-dialog"
import { UpdateSpreadsheetDialog } from "./edit-spreadsheet-dialog"
import type { listSpreadsheets } from "./queries/list-spreadsheet.queries"
import type { SpreadsheetResource } from "./schemas/resource"
import { getSpreadsheetColumns } from "./spreadsheets-table-columns"

type SpreadsheetsTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listSpreadsheets>>]>
  chatbotId: string
}

export function SpreadsheetsTable({
  promises,
  chatbotId,
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
        chatbotId={chatbotId}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        open={rowAction?.variant === "delete"}
        showTrigger={false}
        spreadsheets={rowAction?.row.original ? [rowAction?.row.original] : []}
      />

      <UpdateSpreadsheetDialog
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "update"}
        spreadsheet={rowAction?.row.original || null}
      />
    </>
  )
}
