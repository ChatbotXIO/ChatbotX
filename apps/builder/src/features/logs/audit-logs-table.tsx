"use client"

import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import React, { useMemo } from "react"
import { getAuditColumns } from "./audit-logs-table-columns"
import type { getLogs } from "./queries"

type LogsTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof getLogs>>]>
}

export function AuditLogsTable({ promises }: LogsTableProps) {
  const [{ data, pageCount }] = React.use(promises)

  const columns = useMemo(() => getAuditColumns(), [])

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

  return <DataTable table={table} />
}
