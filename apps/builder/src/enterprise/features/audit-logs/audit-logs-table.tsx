"use client"

import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import { useTranslations } from "next-intl"
import { use, useMemo } from "react"
import { getAuditColumns } from "./audit-logs-table-columns"
import type { listAuditLogs } from "./queries"

type AuditLogsTableProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof listAuditLogs>>]>
}

export function AuditLogsTable({ promises }: AuditLogsTableProps) {
  const t = useTranslations()
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

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-xl">{t("auditLogs.title")}</h3>

      <DataTable table={table} />
    </div>
  )
}
