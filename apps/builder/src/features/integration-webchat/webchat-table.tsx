"use client"

import type { IntegrationWebchatModel } from "@chatbotx.io/database/types"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import { useTranslations } from "next-intl"
import React, { useMemo, useState } from "react"
import { useChatbotId } from "@/hooks/routing"
import { getWebchatColumns } from "./columns/webchat-columns"
import { WebchatTableToolbarActions } from "./components/webchat-table-toolbar-actions"
import type { listIntegrationWebchats } from "./queries"

type WebchatTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listIntegrationWebchats>>]>
}

export function WebchatTable({ promises }: WebchatTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const chatbotId = useChatbotId()
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
    getRowId: (originalRow) => originalRow.id.toString(),
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
