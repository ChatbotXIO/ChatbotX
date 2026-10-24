"use client"

import { useTranslations } from "next-intl"
import { use, useMemo } from "react"
import { AuditLogsDataTable } from "./audit-logs-data-table"
import { AuditLogsFilterToolbar } from "./audit-logs-filter-toolbar"
import { getAuditColumns } from "./audit-logs-table-columns"
import type { listAuditLogAdmins, listAuditLogs } from "./queries"
import type { ListAuditLogsRequest } from "./schema/query"

type AuditLogsTableProps = {
  search: Pick<ListAuditLogsRequest, "from" | "to" | "keyword" | "userId">
  promises: Promise<
    [
      Awaited<ReturnType<typeof listAuditLogs>>,
      Awaited<ReturnType<typeof listAuditLogAdmins>>,
    ]
  >
}

export function AuditLogsTable({ promises, search }: AuditLogsTableProps) {
  const t = useTranslations()
  const [{ data, pageCount }, admins] = use(promises)

  const columns = useMemo(() => getAuditColumns(t), [t])

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-xl">{t("auditLogs.title")}</h3>

      <AuditLogsDataTable
        columns={columns}
        data={data}
        pageCount={pageCount}
        toolbar={
          <AuditLogsFilterToolbar
            from={search.from}
            keyword={search.keyword}
            select={{
              paramKey: "userId",
              value: search.userId,
              label: t("auditLogs.filters.user"),
              allLabel: t("auditLogs.filters.allAdmins"),
              idPrefix: "audit-log-user",
              options: admins.map((admin) => ({
                id: admin.id,
                label: admin.label,
              })),
            }}
            to={search.to}
          />
        }
      />
    </div>
  )
}
