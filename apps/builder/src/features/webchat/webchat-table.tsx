"use client"

import type { IntegrationWebchatModel } from "@aha.chat/database/types"
import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import React, { useMemo, useState } from "react"
import { getWebchatColumns } from "./columns/webchat-columns"
import { WebchatTableToolbarActions } from "./components/webchat-table-toolbar-actions"
import type { getIntegationWebchats } from "./queries/get-webchats.query"

type WebchatTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof getIntegationWebchats>>]>
}

export function WebchatTable({ promises }: WebchatTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const t = useTranslations()

  const [_rowAction, setRowAction] =
    useState<DataTableRowAction<IntegrationWebchatModel> | null>(null)
  const columns = useMemo(() => getWebchatColumns({ t, setRowAction }), [t])

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "updatedAt", desc: true }],
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
          <WebchatTableToolbarActions
            chatbotId={chatbotId}
            onOpenChange={() => setRowAction(null)}
            table={table}
          />
        </DataTableToolbar>
      </DataTable>

      {/* <DeleteWebchatDialog
        chatbotId={chatbotId}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        open={rowAction?.variant === "delete"}
        webchats={rowAction?.row.original ? [rowAction.row.original] : []}
      /> */}
    </>
  )
}
