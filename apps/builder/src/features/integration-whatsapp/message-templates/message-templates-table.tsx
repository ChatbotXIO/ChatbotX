"use client"

import type { WhatsappMessageTemplateModel } from "@aha.chat/database/types"
import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import React, { useMemo, useState } from "react"
import type { getMessageTemplates } from "@/features/integration-whatsapp/message-templates/queries"
import { getColumns } from "./message-templates-table-columns"
import { WhatsappMessageTemplatesTableToolbarActions } from "./message-templates-table-toolbar-actions"

type WhatsappMessageTemplatesTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof getMessageTemplates>>]>
  chatbotId: string
}

export function WhatsappMessageTemplatesTable({
  promises,
  chatbotId,
}: WhatsappMessageTemplatesTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const [_rowAction, setRowAction] =
    useState<DataTableRowAction<WhatsappMessageTemplateModel> | null>(null)

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
    <DataTable table={table}>
      <DataTableToolbar table={table}>
        <WhatsappMessageTemplatesTableToolbarActions chatbotId={chatbotId} />
      </DataTableToolbar>
    </DataTable>
  )
}
