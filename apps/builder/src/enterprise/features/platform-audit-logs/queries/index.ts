import {
  assertEnterpriseFeatures,
  workspaceService,
  workspaceSupportAccessService,
} from "@chatbotx.io/business"
import { listPlatformAuditLogs as listPlatformAuditLogsService } from "@chatbotx.io/business/audit"
import { parseAuditLogsDateRange } from "@/enterprise/features/audit-logs/schema/query"
import type { PaginatedResponse } from "@/features/common/schema/pagination"
import { assertPlatformSuperAdmin } from "@/lib/auth/assert-platform-super-admin"
import type {
  PlatformAuditLogResource,
  PlatformAuditWorkspaceOption,
} from "../schema"
import type { ListPlatformAuditLogsRequest } from "../schema/query"

const PLATFORM_AUDIT_WORKSPACE_OPTION_LIMIT = 200

export async function listPlatformAuditLogs(
  input: ListPlatformAuditLogsRequest,
): Promise<PaginatedResponse<PlatformAuditLogResource>> {
  // Defense in depth behind the (enterprise) route-group layout: the layout
  // only blocks page rendering, not direct invocations of this query.
  await assertEnterpriseFeatures()
  await assertPlatformSuperAdmin()

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

export async function listPlatformAuditWorkspaces(
  selectedId?: string,
): Promise<PlatformAuditWorkspaceOption[]> {
  await assertEnterpriseFeatures()
  await assertPlatformSuperAdmin()

  const { data } = await workspaceSupportAccessService.listWorkspaces({
    page: 1,
    perPage: PLATFORM_AUDIT_WORKSPACE_OPTION_LIMIT,
  })

  const options = data.map((workspace) => ({
    id: workspace.id,
    label: workspace.name,
  }))

  // The list is capped at PLATFORM_AUDIT_WORKSPACE_OPTION_LIMIT, so a
  // deep-linked `?workspaceId=` outside the first page would otherwise
  // render a Select whose value isn't among its own items.
  if (selectedId && !options.some((option) => option.id === selectedId)) {
    const selected = await workspaceService.find({ where: { id: selectedId } })
    if (selected) {
      options.unshift({ id: selected.id, label: selected.name })
    }
  }

  return options
}
