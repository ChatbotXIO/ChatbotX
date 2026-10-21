import {
  assertEnterpriseFeatures,
  isSuperAdmin,
  workspaceSupportAccessService,
} from "@chatbotx.io/business"
import { listPlatformAuditLogs as listPlatformAuditLogsService } from "@chatbotx.io/business/audit"
import { notFound } from "next/navigation"
import type { PaginatedResponse } from "@/features/common/schema/pagination"
import { getCurrentUser } from "@/lib/auth/utils"
import type {
  PlatformAuditLogResource,
  PlatformAuditWorkspaceOption,
} from "../schema"
import {
  type ListPlatformAuditLogsRequest,
  parseAuditLogsDateRange,
} from "../schema/query"

const PLATFORM_AUDIT_WORKSPACE_OPTION_LIMIT = 200

export async function listPlatformAuditLogs(
  input: ListPlatformAuditLogsRequest,
): Promise<PaginatedResponse<PlatformAuditLogResource>> {
  // Defense in depth behind the (enterprise) route-group layout: the layout
  // only blocks page rendering, not direct invocations of this query.
  await assertEnterpriseFeatures()
  const user = await getCurrentUser()
  if (!(user && (await isSuperAdmin(user)))) {
    return notFound()
  }

  const dateRange = parseAuditLogsDateRange(input)

  return await listPlatformAuditLogsService({
    workspaceId: input.workspaceId || undefined,
    page: input.page,
    perPage: input.perPage,
    sort: input.sort,
    keyword: input.keyword,
    dateRange: { start: dateRange.start, end: dateRange.end },
  })
}

export async function listPlatformAuditWorkspaces(): Promise<
  PlatformAuditWorkspaceOption[]
> {
  await assertEnterpriseFeatures()
  const user = await getCurrentUser()
  if (!(user && (await isSuperAdmin(user)))) {
    return notFound()
  }

  const { data } = await workspaceSupportAccessService.listWorkspaces({
    page: 1,
    perPage: PLATFORM_AUDIT_WORKSPACE_OPTION_LIMIT,
  })

  return data.map((workspace) => ({ id: workspace.id, label: workspace.name }))
}
