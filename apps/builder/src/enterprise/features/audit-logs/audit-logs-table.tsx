"use client"

import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import { use, useMemo } from "react"
import { getAuditColumns } from "./audit-logs-table-columns"
import type { listAuditLogs } from "./queries"

type AuditLogsTableProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof listAuditLogs>>]>
}

export function AuditLogsTable({ promises }: AuditLogsTableProps) {
  const [{ data, pageCount }] = use(promises)

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
