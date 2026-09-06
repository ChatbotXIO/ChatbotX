import {
  assertEnterpriseFeatures,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { listAuditLogs as listAuditLogsService } from "@chatbotx.io/business/audit"
import type { PaginatedResponse } from "@/features/common/schema/pagination"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import type { AuditLogResource } from "../schema"
import {
  type ListAuditLogsRequest,
  parseAuditLogsDateRange,
} from "../schema/query"

export type AuditLogAdminOption = {
  id: string
  label: string
}

export async function listAuditLogs(
  input: ListAuditLogsRequest,
): Promise<PaginatedResponse<AuditLogResource>> {
  // Defense in depth behind the (enterprise) route-group layout: the layout
  // only blocks page rendering, not direct invocations of this query.
  await assertEnterpriseFeatures()
  await assertWorkspaceSuperAdmin(input.workspaceId)

  const dateRange = parseAuditLogsDateRange(input)

  return await listAuditLogsService({
    workspaceId: input.workspaceId,
    page: input.page,
    perPage: input.perPage,
    sort: input.sort,
    keyword: input.keyword,
    userId: input.userId,
    dateRange: { start: dateRange.start, end: dateRange.end },
  })
}

export async function listAuditLogAdmins(
  workspaceId: string,
): Promise<AuditLogAdminOption[]> {
  await assertEnterpriseFeatures()
  await assertWorkspaceSuperAdmin(workspaceId)

  const members = await workspaceMemberService.listByWorkspaceId({
    workspaceId,
  })

  return members
    .filter((member) => member.permissions.superAdmin)
    .map((member) => ({
      id: member.user.id,
      label: member.user.name || member.user.email || member.user.id,
    }))
}
