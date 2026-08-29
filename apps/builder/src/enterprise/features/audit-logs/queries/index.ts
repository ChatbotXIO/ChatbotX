import {
  assertEnterpriseFeatures,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { auditLogModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import type { AuditLogResource } from "../schemas"
import {
  type ListAuditLogsRequest,
  parseAuditLogsDateRange,
} from "../schemas/query"

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

  const where = {
    workspaceId: input.workspaceId,
    createdAt: { gte: dateRange.start, lte: dateRange.end },
    userId: input.userId || undefined,
    ...(input.keyword
      ? {
          OR: [
            { action: { ilike: likeContains(input.keyword) } },
            { detail: { ilike: likeContains(input.keyword) } },
            { ipAddress: { ilike: likeContains(input.keyword) } },
          ],
        }
      : {}),
  }

  const pagination = getPaginationWithDefaults(input)
  const orderBy = {
    ...parseOrderByAsObject(auditLogModel, input),
    id: "desc" as const,
  }

  const [data, totalRows] = await Promise.all([
    db.query.auditLogModel.findMany({
      where,
      ...pagination,
      orderBy,
      with: {
        user: true,
      },
    }),
    db.$count(auditLogModel, relationsFilterToSQL(auditLogModel, where)),
  ])

  const pageCount = Math.ceil(totalRows / pagination.limit)

  return { data, pageCount }
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
