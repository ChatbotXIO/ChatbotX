import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { auditLogModel } from "@chatbotx.io/database/schema"
import type { AuditLogModel, UserModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"

type AuditLogFilterInput = {
  userId?: string
  keyword?: string
  dateRange: { start: Date; end: Date }
}

type AuditLogBaseWhere = {
  createdAt: { gte: Date; lte: Date }
  userId: string | undefined
  OR?: {
    action?: { ilike: string }
    detail?: { ilike: string }
    ipAddress?: { ilike: string }
  }[]
}

const buildAuditLogWhere = (input: AuditLogFilterInput): AuditLogBaseWhere => ({
  createdAt: { gte: input.dateRange.start, lte: input.dateRange.end },
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
})

type AuditLogWhere = AuditLogBaseWhere & { workspaceId?: string }

type QueryAuditLogsInput = {
  page: number
  perPage: number
  sort?: { id: string; desc: boolean }[] | null
}

type QueryAuditLogsResult<TData> = {
  data: TData[]
  pageCount: number
}

/**
 * Shared pagination/order-by/count scaffolding for both the workspace-scoped
 * and platform-wide audit log lists. `findMany` runs the actual relational
 * query so each caller's `with` config (and therefore its inferred row type)
 * stays intact without a manual cast.
 */
async function queryAuditLogs<TData>(
  where: AuditLogWhere,
  input: QueryAuditLogsInput,
  findMany: (args: {
    where: AuditLogWhere
    limit: number
    offset: number
    orderBy: Record<string, unknown>
  }) => Promise<TData[]>,
): Promise<QueryAuditLogsResult<TData>> {
  const pagination = getPaginationWithDefaults(input)
  const orderBy = {
    ...parseOrderByAsObject(auditLogModel, input),
    id: "desc" as const,
  }

  const [data, totalRows] = await Promise.all([
    findMany({ where, ...pagination, orderBy }),
    db.$count(auditLogModel, relationsFilterToSQL(auditLogModel, where)),
  ])

  const pageCount = Math.ceil(totalRows / pagination.limit)

  return { data, pageCount }
}

type ListAuditLogsInput = {
  workspaceId: string
  page: number
  perPage: number
  sort?: { id: string; desc: boolean }[] | null
  keyword?: string
  userId?: string
  dateRange: { start: Date; end: Date }
}

type ListAuditLogsResult = QueryAuditLogsResult<
  AuditLogModel & { user: UserModel | null }
>

export async function listAuditLogs(
  input: ListAuditLogsInput,
): Promise<ListAuditLogsResult> {
  // Always scoped by workspaceId, unlike the platform-wide variant below:
  // callers are guarded by assertWorkspaceSuperAdmin, but this contract must
  // hold on its own — an empty workspaceId must never fall through to a
  // cross-workspace query.
  const where: AuditLogWhere = {
    workspaceId: input.workspaceId,
    ...buildAuditLogWhere(input),
  }

  return await queryAuditLogs(where, input, (args) =>
    db.query.auditLogModel.findMany({ ...args, with: { user: true } }),
  )
}

type ListPlatformAuditLogsInput = {
  workspaceId?: string
  page: number
  perPage: number
  sort?: { id: string; desc: boolean }[] | null
  keyword?: string
  dateRange: { start: Date; end: Date }
}

type ListPlatformAuditLogsResult = QueryAuditLogsResult<
  AuditLogModel & {
    user: UserModel | null
    workspace: { id: string; name: string } | null
  }
>

export async function listPlatformAuditLogs(
  input: ListPlatformAuditLogsInput,
): Promise<ListPlatformAuditLogsResult> {
  const where: AuditLogWhere = {
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    ...buildAuditLogWhere(input),
  }

  return await queryAuditLogs(where, input, (args) =>
    db.query.auditLogModel.findMany({
      ...args,
      with: {
        user: true,
        workspace: { columns: { id: true, name: true } },
      },
    }),
  )
}
