"use client"

import { DataTable } from "@/components/data-table"
import { DataTableToolbar } from "@/components/data-table-toolbar"
import type { getMessageTemplates } from "@/features/integration-whatsapp/message-templates/queries"
import { useDataTable } from "@/hooks/use-data-table"
import type { DataTableRowAction } from "@/types/data-table"
import type { WhatsappMessageTemplate } from "@ahachat.ai/database"
import React, { useMemo, useState } from "react"
import { getColumns } from "./message-templates-table-columns"
import { MessageTemplatesTableToolbarActions } from "./message-templates-table-toolbar-actions"

interface MessageTemplatesTableProps {
  promises: Promise<[Awaited<ReturnType<typeof getMessageTemplates>>]>
  chatbotId: string
}

export function MessageTemplatesTable({
  promises,
  chatbotId,
}: MessageTemplatesTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const [_rowAction, setRowAction] =
    useState<DataTableRowAction<WhatsappMessageTemplate> | null>(null)

  const columns = useMemo(() => getColumns({ setRowAction }), [])

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
          <MessageTemplatesTableToolbarActions chatbotId={chatbotId} />
        </DataTableToolbar>
      </DataTable>
    </>
  )
}
