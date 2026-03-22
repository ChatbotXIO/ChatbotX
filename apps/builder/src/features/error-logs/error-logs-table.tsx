"use client"

import type { ErrorLogModel } from "@aha.chat/database/types"
import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import { DeleteErrorLogsDialog } from "./delete-error-logs"
import { getColumns } from "./error-logs-table-columns"
import { ErrorLogsTableToolbarActions } from "./error-logs-table-toolbar-actions"
import type { listErrorLogs } from "./queries"

type ErrorLogsTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listErrorLogs>>]>
  chatbotId: string
}

export function ErrorLogsTable({ promises, chatbotId }: ErrorLogsTableProps) {
  const t = useTranslations()
  const router = useRouter()

  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<ErrorLogModel> | null>(null)

  const columns = useMemo(() => getColumns({ setRowAction, t }), [t])

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
          <ErrorLogsTableToolbarActions chatbotId={chatbotId} table={table} />
        </DataTableToolbar>
      </DataTable>

      <DeleteErrorLogsDialog
        chatbotId={chatbotId}
        errorLogs={rowAction?.row.original ? [rowAction?.row.original] : []}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          rowAction?.row.toggleSelected(false)
          router.refresh()
        }}
        open={rowAction?.variant === "delete"}
        showTrigger={false}
      />
    </>
  )
}
