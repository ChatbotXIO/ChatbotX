import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { PlatformAuditLogsTable } from "@/enterprise/features/platform-audit-logs/platform-audit-logs-table"
import {
  listPlatformAuditLogs,
  listPlatformAuditWorkspaces,
} from "@/enterprise/features/platform-audit-logs/queries"
import { listPlatformAuditLogsSearchParamsCache } from "@/enterprise/features/platform-audit-logs/schema/query"

export default async function PlatformAuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const [t, search] = await Promise.all([
    getTranslations(),
    listPlatformAuditLogsSearchParamsCache.parse(await searchParams),
  ])

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="font-bold text-lg sm:text-xl">
          {t("platformAdmin.auditLogs.title")}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t("platformAdmin.auditLogs.description")}
        </p>
      </div>

      <Suspense>
        <PlatformAuditLogsTable
          promises={Promise.all([
            listPlatformAuditLogs(search),
            listPlatformAuditWorkspaces(),
          ])}
          search={search}
        />
      </Suspense>
    </div>
  )
}
