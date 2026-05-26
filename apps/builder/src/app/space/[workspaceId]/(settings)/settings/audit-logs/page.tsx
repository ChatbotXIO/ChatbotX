import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AuditLogsTable } from "@/features/audit-logs/audit-logs-table"
import {
  listAuditLogActions,
  listAuditLogs,
} from "@/features/audit-logs/queries"
import { listAuditLogsSearchParamsCache } from "@/features/audit-logs/schemas/query"
import { listWorkspaceMembers } from "@/features/workspace-members/queries"
import { getWorkspaceMembersSearchParamsCache } from "@/features/workspace-members/schema/query"

export default async function AuditLogsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = listAuditLogsSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    listAuditLogs({ ...search, workspaceId }),
    listAuditLogActions(workspaceId),
    listWorkspaceMembers({
      workspaceId,
      ...getWorkspaceMembersSearchParamsCache.parse({}),
    }),
  ])

  return (
    <Suspense>
      <AuditLogsTable promises={promises} workspaceId={workspaceId} />
    </Suspense>
  )
}
